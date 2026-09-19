import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUTOMATION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(AUTOMATION_DIR, '..');
export const QUEUE_PATH = path.join(AUTOMATION_DIR, 'queue', 'calendar.json');

// Times in the queue are IST. Cron runs in UTC; this offset keeps them honest.
export const IST_OFFSET = '+05:30';

export const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v26.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;

// Minimal .env loader so the scheduler has zero runtime dependencies.
// Non-secret settings (page/IG ids, asset URL) live in config.json so the workflow file never
// needs editing — the Mac's GitHub key cannot push workflow changes.
export function loadEnv() {
  const envPath = path.join(AUTOMATION_DIR, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const cfgPath = path.join(AUTOMATION_DIR, 'config.json');
  if (existsSync(cfgPath)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(cfgPath, 'utf8')))) {
      if (v && !process.env[k]) process.env[k] = v;
    }
  }
}

export async function loadQueue() {
  return JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
}

export async function saveQueue(queue) {
  await writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n');
}

// Epoch millis for an item scheduled at `date` + `time` IST.
export function scheduledEpoch(item) {
  return Date.parse(`${item.date}T${item.time}:00${IST_OFFSET}`);
}

export function assetPath(rel) {
  return path.join(REPO_ROOT, rel);
}

// Public URL for an asset — required by the Instagram API (it fetches by URL).
export function assetUrl(rel) {
  const base = process.env.ASSET_BASE_URL;
  if (!base) throw new Error('ASSET_BASE_URL is not set (public base URL the repo assets are served from)');
  return `${base.replace(/\/$/, '')}/${rel.split(path.sep).join('/')}`;
}

// Graph API call with readable errors.
export async function graph(url, { method = 'GET', params = {}, body } = {}) {
  const qs = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN });
  const res = await fetch(`${url}?${qs}`, { method, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Graph API ${method} ${url.replace(/https:\/\/[^/]+/, '')} failed: ${e.message || text} (code ${e.code ?? res.status})`);
  }
  return json;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function log(msg) {
  console.log(`[autopost ${new Date().toISOString()}] ${msg}`);
}
