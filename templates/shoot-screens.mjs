// Shoot a set of demo-firm screens for content use:
//   node templates/shoot-screens.mjs output/scalio-30
// Phone shots 1170×2532, computer shots 2560×1600, straight to JPG. Demo firm only — never a real firm.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import puppeteer from '../reels/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'output/scalio-30');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEMO = 'https://demo.goldkhata.com';
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3 };
const DESK = { width: 1280, height: 800, deviceScaleFactor: 2 };

const SHOTS = [
  // the counter, on a phone
  { n: '01-dashboard', p: '/dashboard', dev: 'phone' },
  { n: '02-loans-list', p: '/loans', dev: 'phone' },
  { n: '03-new-loan-customer', p: '/loans/new', dev: 'phone' },
  { n: '04-new-loan-ornaments', p: '/loans/new', dev: 'phone', prep: [{ type: ['input[placeholder*="Search"]', 'Harish'] }, { tap: 'Harish' }, { tap: 'Next' }] },
  { n: '05-loan-page', p: 'LOAN', dev: 'phone' },
  { n: '06-collect-payment', p: 'LOAN', dev: 'phone', prep: [{ tap: 'Collect Payment' }] },
  { n: '07-renew-loan', p: 'LOAN', dev: 'phone', prep: [{ tap: 'Renew' }] },
  { n: '08-close-release', p: 'LOAN', dev: 'phone', prep: [{ tap: 'Close & Release' }] },
  { n: '09-top-up', p: 'LOAN', dev: 'phone', prep: [{ tap: 'Top-Up' }] },
  { n: '10-customer-statement', p: 'CUSTOMER/statement', dev: 'phone' },
  { n: '11-customers', p: '/customers', dev: 'phone' },
  { n: '12-customer-profile', p: 'CUSTOMER', dev: 'phone' },
  { n: '13-day-close-tally', p: '/cash-close', dev: 'phone' },
  { n: '14-payments', p: '/payments', dev: 'phone' },
  { n: '15-notices', p: '/notices', dev: 'phone' },
  { n: '16-gold-rates', p: '/gold/rates', dev: 'phone' },
  { n: '17-whatsapp-setup', p: '/settings/whatsapp', dev: 'phone' },
  { n: '18-interest-calculator', p: '/interest-calculator', dev: 'phone' },
  // the detail, on a computer
  { n: '19-day-book', p: '/reports/day-book', dev: 'desk' },
  { n: '20-bank-reconciliation', p: '/finance/reconcile', dev: 'desk' },
  { n: '21-risk-radar', p: '/reports/risk-radar', dev: 'desk' },
  { n: '22-profitability', p: '/reports/profitability', dev: 'desk' },
  { n: '23-jewellery-dashboard', p: '/jewellery/dashboard', dev: 'desk' },
  { n: '24-gold-loan-ledger', p: '/reports/gold-loan-ledger', dev: 'desk' },
  { n: '25-delivery-register', p: '/deliveries', dev: 'desk' },
  { n: '26-auctions', p: '/auctions', dev: 'desk' },
  { n: '27-jewellery-bill', p: '/jewellery/sales/new', dev: 'desk' },
  { n: '28-jewellery-stock', p: '/jewellery/inventory', dev: 'desk' },
  { n: '29-interest-settings', p: '/settings/interest', dev: 'desk' },
  { n: '30-staff-roles', p: '/settings/users', dev: 'desk' },
];

const only = (process.argv[3] || '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(ROOT, 'reels/.session/profile') });
const page = await browser.newPage();
const open = async (url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2800));            // the app polls; network never idles
  if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('demo session expired — run: node reels/engine/capture.mjs login');
};
const tap = async (text) => {
  const b = await page.evaluate((t) => {
    const hit = [...document.querySelectorAll('button,a,[role="button"],li,tr,div,span,p')]
      .filter((n) => n.textContent.trim().toLowerCase().startsWith(t.toLowerCase()) && n.getBoundingClientRect().width > 20)
      .sort((x, y) => x.textContent.length - y.textContent.length)[0];
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' });
    const r = hit.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!b) throw new Error(`nothing to tap: "${text}"`);
  await page.mouse.click(b.x, b.y);
  await new Promise((r) => setTimeout(r, 2500));
};

let loanUrl = null, customerUrl = null;
const failed = [];
for (const s of SHOTS) {
 if (only.length && !only.includes(s.n.slice(0, 2))) continue;
 try {
  await page.setViewport(s.dev === 'phone' ? PHONE : DESK);
  if (s.p === 'LOAN') {
    if (!loanUrl) {
      await open(`${DEMO}/loans`);
      const num = await page.evaluate(() => {
        const nums = [...document.querySelectorAll('*')].filter((n) => /^[A-Z]\d{4}$/.test(n.textContent.trim()));
        const card = (n) => { let c = n; while (c.parentElement && c.getBoundingClientRect().height < 160) c = c.parentElement; return c.textContent; };
        return (nums.find((n) => /ACTIVE/i.test(card(n)) && !/CLOSED/i.test(card(n))) || nums[0])?.textContent.trim() || null;
      });
      if (!num) throw new Error('no loan in the demo firm');
      await tap(num);
      loanUrl = page.url();
    }
    await open(loanUrl);
  } else if (s.p.startsWith('CUSTOMER')) {
    if (!customerUrl) {
      await open(`${DEMO}/customers`);
      const code = await page.evaluate(() => [...document.querySelectorAll('*')]
        .map((x) => x.textContent.trim()).find((t) => /^C\d{4}$/.test(t)) || null);
      if (!code) throw new Error('no customer in the demo firm');
      await tap(code);
      if (!/\/customers\/[A-Za-z0-9_-]{6,}/.test(page.url())) throw new Error(`tapping ${code} opened ${page.url()}`);
      customerUrl = page.url().replace(/\/statement$/, '');
    }
    await open(customerUrl + (s.p.includes('/statement') ? '/statement' : ''));
  } else {
    await open(DEMO + s.p);
  }
  for (const step of s.prep || []) {
    if (step.type) { await page.type(step.type[0], step.type[1], { delay: 40 }); await new Promise((r) => setTimeout(r, 1800)); }
    if (step.tap) await tap(step.tap);
  }
  const file = path.join(OUT, `${s.n}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log(`  ${s.n.padEnd(24)} ${s.dev === 'phone' ? '1170×2532' : '2560×1600'}  ${s.p}`);
 } catch (e) { failed.push(`${s.n}: ${e.message.slice(0, 70)}`); console.log(`  ${s.n.padEnd(24)} SKIPPED — ${e.message.slice(0, 60)}`); }
}
await browser.close();
console.log(`  ${SHOTS.length - failed.length}/${SHOTS.length} screens → ${path.relative(ROOT, OUT)}`);
if (failed.length) console.log('  could not shoot:\n   ' + failed.join('\n   '));
