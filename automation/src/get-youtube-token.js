import readline from 'node:readline/promises';
import { loadEnv } from './lib.js';

// One-time helper: prints a Google sign-in URL, you approve with the
// GoldKhata channel's Google account, paste the code back, and it prints the
// YOUTUBE_REFRESH_TOKEN to put in .env / GitHub secrets.
// Same flow as the youtube-automation project.

loadEnv();
const { google } = await import('googleapis');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in automation/.env first (see SETUP.md Part B).');
  process.exit(1);
}

const auth = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
const url = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'],
});

console.log('\n1. Open this URL and sign in with the Google account that owns the GoldKhata YouTube channel:\n');
console.log(url);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question('\n2. Paste the code shown after approving: ')).trim();
rl.close();

const { tokens } = await auth.getToken(code);
console.log('\nAdd this line to automation/.env (and YOUTUBE_REFRESH_TOKEN secret on GitHub):\n');
console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
