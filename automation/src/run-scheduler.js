import { loadEnv, loadQueue, saveQueue, scheduledEpoch, log } from './lib.js';

// The posting brain. Run it any time (cron / GitHub Actions / by hand):
//   node src/run-scheduler.js            → posts everything due
//   node src/run-scheduler.js --dry-run  → shows what WOULD post, touches nothing
//
// An item posts only when ALL of these are true:
//   - its scheduled IST time has passed
//   - it passed less than STALE_HOURS ago (safety: if the cron was dead for
//     days, old items are marked skipped_stale instead of flooding the feed)
//   - approved: true in the queue (or AUTO_APPROVE=true in the environment)
//   - the platform hasn't already been posted (safe to re-run after failures)

const DRY = process.argv.includes('--dry-run');
const STALE_HOURS = Number(process.env.STALE_HOURS || 24);

const POSTERS = {
  instagram: async (item) => (await import('./post-instagram.js')).postInstagram(item),
  facebook: async (item) => (await import('./post-facebook.js')).postFacebook(item),
  youtube: async (item) => (await import('./post-youtube.js')).postYouTube(item),
};

loadEnv();
// ponytail: all queued platforms are Meta today; make this per-platform when YouTube posting goes live
if (!process.env.META_ACCESS_TOKEN && !DRY) {
  log('META_ACCESS_TOKEN not set: Instagram/Facebook not connected yet, nothing posted');
  process.exit(0);
}
const queue = await loadQueue();
const now = Date.now();
const autoApprove = process.env.AUTO_APPROVE === 'true';
let failures = 0;
let acted = false;

for (const item of queue.items) {
  if (item.status === 'posted' || item.status === 'skipped_stale') continue;

  const at = scheduledEpoch(item);
  if (Number.isNaN(at)) { log(`SKIP ${item.id}: bad date/time`); continue; }
  if (at > now) continue;

  const hoursLate = (now - at) / 3_600_000;
  if (hoursLate > STALE_HOURS) {
    log(`STALE ${item.id}: due ${hoursLate.toFixed(1)}h ago — marking skipped_stale (re-schedule it to post)`);
    if (!DRY) { item.status = 'skipped_stale'; acted = true; }
    continue;
  }

  if (!item.approved && !autoApprove) {
    log(`HOLD ${item.id}: due but approved=false (set approved: true in queue/calendar.json)`);
    continue;
  }

  item.posted ||= {};
  item.errors ||= {};
  for (const platform of item.platforms) {
    if (item.posted[platform]) continue;
    if (!POSTERS[platform]) { log(`SKIP ${item.id}/${platform}: unknown platform`); continue; }
    if (DRY) { log(`DRY ${item.id}/${platform}: would post ${item.format} (${item.assets.length} asset/s)`); continue; }

    try {
      log(`POST ${item.id} → ${platform}…`);
      const id = await POSTERS[platform](item);
      item.posted[platform] = { id, at: new Date().toISOString() };
      delete item.errors[platform];
      log(`OK   ${item.id}/${platform}: ${id}`);
    } catch (err) {
      failures++;
      item.errors[platform] = { message: String(err.message || err), at: new Date().toISOString() };
      log(`FAIL ${item.id}/${platform}: ${err.message}`);
    }
    acted = true;
  }

  if (item.platforms.every((p) => item.posted[p])) item.status = 'posted';
}

if (!DRY && acted) await saveQueue(queue);
if (!acted) log(DRY ? 'dry-run: nothing due right now' : 'nothing due right now');
if (failures) { log(`${failures} platform post(s) failed — see errors in queue/calendar.json`); process.exit(1); }
