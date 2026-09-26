// node engine/capture.mjs login
//   Opens a small Chrome window on the demo firm. The owner signs in once (Claude may not type
//   passwords, even the public demo one); the session is kept in reels/.session/ (git-ignored).
//
// node engine/capture.mjs shots scripts/<id>.json
//   Shoots every "screen" scene of that reel at phone size from the demo firm and writes the
//   shot path + the box to ring into the script.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const REELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path.join(REELS, '.session', 'profile');
const DEMO = 'https://demo.goldkhata.com';
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3 };   // shot: 1170 × 2532
const cmd = process.argv[2];

if (cmd === 'login') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false, userDataDir: PROFILE, defaultViewport: null,
    args: ['--window-size=520,900', `--app=${DEMO}/login`],
  });
  const [page] = await browser.pages();
  const deadline = Date.now() + Number(process.argv[3] || 8 * 60) * 1000;
  let inside = false;
  while (Date.now() < deadline) {
    try {
      const u = new URL(page.url());
      if (u.origin === DEMO && !u.pathname.startsWith('/login')) { inside = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (inside) {
    await new Promise((r) => setTimeout(r, 4000));      // let the session cookie settle
    console.log(`signed in (${new URL(page.url()).pathname}) — session saved`);
  } else {
    console.log('not signed in yet — window left open');
  }
  await browser.close();                                 // closing flushes cookies to disk
  process.exit(inside ? 0 : 2);
}

if (cmd === 'shots') {
  const specPath = path.resolve(REELS, process.argv[3]);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const dir = path.join(REELS, 'shots', spec.id);
  mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: PROFILE });
  const page = await browser.newPage();
  await page.setViewport(PHONE);

  let loanId = null;
  const resolvePath = async (p) => {
    if (!p.includes(':id')) return p;
    if (!loanId) {
      await page.goto(`${DEMO}/loans`, { waitUntil: 'networkidle2' });
      loanId = await page.evaluate(() => {
        const a = [...document.querySelectorAll('a[href*="/loans/"]')].map((x) => x.getAttribute('href'))
          .find((h) => /\/loans\/[A-Za-z0-9_-]+$/.test(h) && !h.endsWith('/new'));
        return a ? a.split('/').pop() : null;
      });
      if (!loanId) throw new Error('no loan found in the demo firm');
    }
    return p.replace(':id', loanId);
  };

  for (const [i, s] of spec.scenes.entries()) {
    if (s.type !== 'screen' || !s.capture) continue;
    const url = DEMO + (await resolvePath(s.capture.path));
    await page.goto(url, { waitUntil: 'networkidle2' });
    if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('demo session expired — run: node engine/capture.mjs login');
    for (const step of s.capture.prep || []) {
      if (step.click) await page.evaluate((t) => {
        const el = [...document.querySelectorAll('button,a,[role="button"],label')].find((n) => n.textContent.trim().startsWith(t));
        el?.click();
      }, step.click);
      if (step.type) await page.type(step.type[0], step.type[1], { delay: 30 });
      await new Promise((r) => setTimeout(r, step.wait || 700));
    }
    // The element to ring: a selector, or the smallest block that carries this label text.
    const box = await page.evaluate((focus) => {
      const pick = () => {
        if (focus.startsWith('#') || focus.startsWith('.') || focus.startsWith('[')) return document.querySelector(focus);
        const hit = [...document.querySelectorAll('h1,h2,h3,h4,label,th,td,dt,dd,span,p,div,button')]
          .filter((n) => n.textContent.trim().toLowerCase().includes(focus.toLowerCase()))
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        if (!hit) return null;
        let n = hit;                                     // grow to the card/section around the label
        while (n.parentElement && n.getBoundingClientRect().height < 90 && n.parentElement.getBoundingClientRect().height < 560) n = n.parentElement;
        return n;
      };
      const el = pick();
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      return new Promise((res) => setTimeout(() => {
        const r = el.getBoundingClientRect();
        res({ x: r.x, y: r.y, w: r.width, h: r.height, scrollY: window.scrollY, text: el.textContent.trim().slice(0, 60) });
      }, 500));
    }, s.capture.focus);
    if (!box) throw new Error(`scene ${i}: nothing on ${url} matches "${s.capture.focus}"`);
    const file = path.join(dir, `${i}.png`);
    await page.screenshot({ path: file });               // viewport only = exactly one phone screen
    const k = PHONE.deviceScaleFactor;
    s.shot = path.relative(REELS, file);
    s.shotWidth = PHONE.width * k;
    s.focus = { x: Math.round(box.x * k), y: Math.round(box.y * k), w: Math.round(box.w * k), h: Math.round(box.h * k) };
    delete s.scrollY;                                    // the screenshot is already at the right scroll
    console.log(`  scene ${i} ${s.capture.path} → ${path.basename(file)}  ring on "${box.text}"`);
  }
  await browser.close();
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(`  wrote shots into ${path.relative(REELS, specPath)}`);
}
