import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { assetPath, log } from './lib.js';

// YouTube Shorts upload — same auth pattern as the youtube-automation project:
// GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN in .env.
// A vertical MP4 under 3 minutes is automatically treated as a Short.

export async function postYouTube(item) {
  const { google } = await import('googleapis');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const youtube = google.youtube({ version: 'v3', auth });

  const videoRel = item.assets[0];
  if (!/\.mp4$/i.test(videoRel)) throw new Error(`YouTube needs an MP4, got "${videoRel}"`);
  const videoFile = assetPath(videoRel);
  await stat(videoFile);

  const yt = item.youtube || {};
  const title = yt.title || item.caption.split('\n')[0].slice(0, 95) + ' #Shorts';
  const description = yt.description
    || `${item.caption}\n\nGoldKhata — gold loan software for your firm\nhttps://goldkhata.com`;

  log(`  youtube: uploading ${videoRel}…`);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags: yt.tags || ['gold loan software', 'girvi', 'GoldKhata', 'pawnbroker software'],
        categoryId: '28',
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: yt.privacy || 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: createReadStream(videoFile) },
  });
  return res.data.id;
}
