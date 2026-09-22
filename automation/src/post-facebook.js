import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GRAPH, graph, assetPath, log } from './lib.js';

// Facebook Pages API. Photos and videos are uploaded directly from the repo
// files (multipart) — no public hosting needed on this side.

function pageId() {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error('META_PAGE_ID is not set');
  return id;
}

function mime(rel) {
  return /\.png$/i.test(rel) ? 'image/png'
    : /\.jpe?g$/i.test(rel) ? 'image/jpeg'
    : /\.mp4$/i.test(rel) ? 'video/mp4'
    : 'application/octet-stream';
}

async function fileForm(rel, fields = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const buf = await readFile(assetPath(rel));
  fd.append('source', new Blob([buf], { type: mime(rel) }), path.basename(rel));
  return fd;
}

async function uploadUnpublishedPhoto(rel) {
  const { id } = await graph(`${GRAPH}/${pageId()}/photos`, {
    method: 'POST',
    body: await fileForm(rel, { published: 'false' }),
  });
  return id;
}

export async function postFacebook(item) {
  const message = item.caption_facebook || item.caption;

  if (item.format === 'carousel') {
    const ids = [];
    for (const rel of item.assets) {
      ids.push(await uploadUnpublishedPhoto(rel));
      log(`  facebook: photo ${ids.length}/${item.assets.length} uploaded`);
    }
    const { id } = await graph(`${GRAPH}/${pageId()}/feed`, {
      method: 'POST',
      params: {
        message,
        attached_media: JSON.stringify(ids.map((media_fbid) => ({ media_fbid }))),
      },
    });
    return id;
  }

  if (item.format === 'image') {
    const { id, post_id } = await graph(`${GRAPH}/${pageId()}/photos`, {
      method: 'POST',
      body: await fileForm(item.assets[0], { message }),
    });
    return post_id || id;
  }

  if (item.format === 'reel') {
    // Facebook Reels API: start → upload the bytes → finish (a plain /videos post is not a reel).
    const { video_id, upload_url } = await graph(`${GRAPH}/${pageId()}/video_reels`, {
      method: 'POST',
      params: { upload_phase: 'start' },
    });
    const buf = await readFile(assetPath(item.assets[0]));
    const res = await fetch(upload_url, {
      method: 'POST',
      headers: { Authorization: `OAuth ${process.env.META_ACCESS_TOKEN}`, offset: '0', file_size: String(buf.length) },
      body: buf,
    });
    const up = await res.json().catch(() => ({}));
    if (!res.ok || up.success !== true) throw new Error(`Facebook reel upload failed: ${JSON.stringify(up)}`);
    await graph(`${GRAPH}/${pageId()}/video_reels`, {
      method: 'POST',
      params: { upload_phase: 'finish', video_id, video_state: 'PUBLISHED', description: message },
    });
    log('  facebook: reel published');
    return video_id;
  }

  throw new Error(`Unknown format "${item.format}" for Facebook (use carousel | image | reel)`);
}
