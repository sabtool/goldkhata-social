import { GRAPH, graph, assetUrl, sleep, log } from './lib.js';

// Instagram Content Publishing API.
// - Images must be JPEG and publicly reachable via URL (ASSET_BASE_URL).
// - Carousels: create one container per slide, then a CAROUSEL container, then publish.
// - Reels: create a REELS container from video_url, wait until processed, then publish.
// Limit: 50 API-published posts per 24h per IG account — far above our schedule.

function igUser() {
  const id = process.env.META_IG_USER_ID;
  if (!id) throw new Error('META_IG_USER_ID is not set');
  return id;
}

function requireJpeg(rel) {
  if (!/\.jpe?g$/i.test(rel)) {
    throw new Error(`Instagram requires JPEG images — got "${rel}". Convert with: sips -s format jpeg -s formatOptions 92 file.png --out file.jpg`);
  }
  return rel;
}

async function waitUntilReady(creationId, { tries = 30, intervalMs = 10_000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { status_code } = await graph(`${GRAPH}/${creationId}`, { params: { fields: 'status_code' } });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Instagram media container ${creationId} failed processing`);
    await sleep(intervalMs);
  }
  throw new Error(`Instagram media container ${creationId} not ready after ${tries} checks`);
}

async function publish(creationId) {
  const { id } = await graph(`${GRAPH}/${igUser()}/media_publish`, {
    method: 'POST',
    params: { creation_id: creationId },
  });
  return id;
}

export async function postInstagram(item) {
  const caption = item.caption_instagram || item.caption;

  if (item.format === 'carousel') {
    if (!item.assets?.length || item.assets.length < 2 || item.assets.length > 10) {
      throw new Error(`Instagram carousels need 2–10 slides, got ${item.assets?.length ?? 0}`);
    }
    const children = [];
    for (const rel of item.assets) {
      const { id } = await graph(`${GRAPH}/${igUser()}/media`, {
        method: 'POST',
        params: { image_url: assetUrl(requireJpeg(rel)), is_carousel_item: 'true' },
      });
      children.push(id);
      log(`  instagram: slide container ${children.length}/${item.assets.length}`);
    }
    const { id: carouselId } = await graph(`${GRAPH}/${igUser()}/media`, {
      method: 'POST',
      params: { media_type: 'CAROUSEL', children: children.join(','), caption },
    });
    await waitUntilReady(carouselId, { tries: 12, intervalMs: 5_000 });
    return publish(carouselId);
  }

  if (item.format === 'image') {
    const { id } = await graph(`${GRAPH}/${igUser()}/media`, {
      method: 'POST',
      params: { image_url: assetUrl(requireJpeg(item.assets[0])), caption },
    });
    await waitUntilReady(id, { tries: 12, intervalMs: 5_000 });
    return publish(id);
  }

  if (item.format === 'reel') {
    const { id } = await graph(`${GRAPH}/${igUser()}/media`, {
      method: 'POST',
      params: {
        media_type: 'REELS',
        video_url: assetUrl(item.assets[0]),
        caption,
        share_to_feed: 'true',
      },
    });
    log('  instagram: reel uploaded, waiting for processing…');
    await waitUntilReady(id);
    return publish(id);
  }

  throw new Error(`Unknown format "${item.format}" for Instagram (use carousel | image | reel)`);
}
