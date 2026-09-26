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
const SETTLE = 2500;   // the app keeps polling, so wait a fixed beat instead of network idle

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

  const open = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, SETTLE));           // the app polls; network never idles
    if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('demo session expired — run: node engine/capture.mjs login');
  };
  // Find the smallest visible element whose text starts with `text`.
  const find = (text, grow = false) => page.evaluate(([t, g]) => {
    let hit = [...document.querySelectorAll('button,a,[role="button"],li,tr,div,span,p,h1,h2,h3,label')]
      .filter((n) => n.textContent.trim().toLowerCase().startsWith(t.toLowerCase()) && n.getBoundingClientRect().width > 20)
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!hit) return null;
    // grow: ring the card around the label, not the label alone
    if (g) while (hit.parentElement && hit.parentElement.getBoundingClientRect().height < window.innerHeight * 0.62) hit = hit.parentElement;
    hit.scrollIntoView({ block: 'center' });
    const r = hit.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, text: hit.textContent.trim().slice(0, 50) };
  }, [text, grow]);
  // A real tap: React ignores .click() on a wrapper, but a mouse event at the centre works.
  const tap = async (text) => {
    const b = await find(text);
    if (!b) throw new Error(`nothing to tap: "${text}"`);
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await new Promise((r) => setTimeout(r, 2200));
  };

  let loanId = null;
  const resolvePath = async (p2) => {
    if (!p2.includes(':id')) return p2;
    if (!loanId) {
      await open(`${DEMO}/loans`);
      // Prefer a live loan: a closed one shows zeroes and reads wrong in a demo.
      const num = await page.evaluate(() => {
        const nums = [...document.querySelectorAll('*')].filter((n) => /^[A-Z]\d{4}$/.test(n.textContent.trim()));
        const card = (n) => { let c = n; while (c.parentElement && c.getBoundingClientRect().height < 160) c = c.parentElement; return c.textContent; };
        const live = nums.find((n) => /ACTIVE/i.test(card(n)) && !/CLOSED/i.test(card(n)));
        return (live || nums[0])?.textContent.trim() || null;
      });
      if (!num) throw new Error('no loan card in the demo firm');
      await tap(num);
      await new Promise((r) => setTimeout(r, 1500));
      loanId = (page.url().match(/\/loans\/([A-Za-z0-9_-]+)/) || [])[1];
      if (!loanId) throw new Error('tapping a loan card did not open a loan');
    }
    return p2.replace(':id', loanId);
  };

  for (const [i, s2] of spec.scenes.entries()) {
    if (s2.type !== 'screen' || !s2.capture) continue;
    const target = await resolvePath(s2.capture.path);
    if (page.url() !== DEMO + target) await open(DEMO + target);
    for (const step of s2.capture.prep || []) {
      if (step.type) { await page.type(step.type[0], step.type[1], { delay: 40 }); await new Promise((r) => setTimeout(r, step.wait || 1500)); }
      if (step.click) await tap(step.click);
    }
    const box = await find(s2.capture.focus, s2.capture.grow);
    if (!box) throw new Error(`scene ${i}: nothing on ${target} matches "${s2.capture.focus}"`);
    await new Promise((r) => setTimeout(r, 600));            // let scrollIntoView finish
    const after = await find(s2.capture.focus, s2.capture.grow);   // box after scrolling
    const file = path.join(dir, `${i}.png`);
    await page.screenshot({ path: file });                   // viewport only = one phone screen
    const k = PHONE.deviceScaleFactor;
    s2.shot = path.relative(REELS, file);
    s2.shotWidth = PHONE.width * k;
    s2.focus = { x: Math.round(after.x * k), y: Math.round(after.y * k), w: Math.round(after.w * k), h: Math.round(after.h * k) };
    delete s2.scrollY;
    console.log(`  scene ${i} ${s2.capture.path} → ring on "${after.text}"`);
  }
  await browser.close();
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(`  wrote shots into ${path.relative(REELS, specPath)}`);
}
