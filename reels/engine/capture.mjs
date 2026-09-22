// node engine/capture.mjs login
//   Opens a small Chrome window on the demo firm. The owner signs in once (Claude may not type
//   passwords, even the public demo one); the session is kept in reels/.session/ (git-ignored).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const REELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PROFILE = path.join(REELS, '.session', 'profile');
export const DEMO = 'https://demo.goldkhata.com';

if (process.argv[2] === 'login') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false, userDataDir: PROFILE, defaultViewport: null,
    args: ['--window-size=520,900', `--app=${DEMO}/login`],
  });
  const [page] = await browser.pages();
  const deadline = Date.now() + 12 * 3600e3;
  // Poll the URL from outside the page: the login redirect would kill an in-page wait.
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.startsWith(DEMO) && !new URL(url).pathname.startsWith('/login')) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 4000));
  console.log(`signed in (${page.url()}), session saved`);
  await browser.close();
}
