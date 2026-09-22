// Render one reel: node engine/render.mjs scripts/<id>.json [--seconds N] [--no-audio]
// Needs voice/<id>/<n>.mp3 + .json (from engine/voice.mjs) for every scene that has a "vo" line.
// Output: ../output/reels/<id>.mp4 and <id>_cover.jpg (1080x1920, H.264/AAC, 30 fps).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REELS = path.resolve(HERE, '..');
const ROOT = path.resolve(REELS, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 30;
const VO_LEAD = 0.18;          // voice starts this long after its scene starts
const VO_TAIL = 0.42;          // breathing room after each line
const MIN = { hook: 2.4, proof: 2.2, screen: 3.0, card: 3.0, cta: 3.4 };

const args = process.argv.slice(2);
const specPath = path.resolve(REELS, args[0]);
const limit = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : Infinity;
const withAudio = !args.includes('--no-audio');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const voiceDir = path.join(REELS, 'voice', spec.id);
const outDir = path.join(ROOT, 'output', 'reels');
mkdirSync(outDir, { recursive: true });

// 1. Timeline from the voice lines.
let t = 0;
const words = [];
spec.scenes.forEach((s, i) => {
  s.i = i;
  let voDur = 0;
  const al = path.join(voiceDir, `${i}.json`);
  if (s.vo && existsSync(al)) {
    const a = JSON.parse(readFileSync(al, 'utf8')).alignment;
    voDur = a.character_end_times_seconds.at(-1);
    words.push(...wordsFrom(a, t + VO_LEAD, i));
    s.audio = path.join(voiceDir, `${i}.mp3`);
  } else if (s.vo && withAudio) {
    throw new Error(`scene ${i} has a voice line but no voice file — run engine/voice.mjs first`);
  }
  s.start = t;
  s.end = t + Math.max(MIN[s.type] || 3, voDur ? VO_LEAD + voDur + VO_TAIL : 0, s.hold || 0);
  t = s.end;
});
const total = Math.min(t, limit);

// Voice text says "Gold Khaataa" so it is pronounced right; captions show the brand as written.
function wordsFrom(a, offset, scene) {
  const out = [];
  let cur = null;
  a.characters.forEach((ch, k) => {
    if (/\s/.test(ch)) { if (cur) out.push(cur); cur = null; return; }
    if (!cur) cur = { text: '', start: offset + a.character_start_times_seconds[k] };
    cur.text += ch;
    cur.end = offset + a.character_end_times_seconds[k];
  });
  if (cur) out.push(cur);
  const merged = [];
  for (const w of out) {
    const prev = merged.at(-1);
    if (prev && prev.text === 'Gold' && /^Khaataa/.test(w.text)) {
      prev.text = 'GoldKhata' + w.text.replace(/^Khaataa/, '');
      prev.end = w.end;
    } else merged.push({ ...w, scene });
  }
  // Phrases of up to 4 words, broken after punctuation.
  let phrase = 0, n = 0;
  for (const w of merged) {
    w.phrase = `${scene}-${phrase}`;
    n++;
    if (n >= 4 || /[.,!?:;—]$/.test(w.text)) { phrase++; n = 0; }
  }
  return merged;
}

// 2. Frames.
const toUrl = (p) => pathToFileURL(path.resolve(REELS, p)).href;
const pageSpec = {
  logo: pathToFileURL(path.join(ROOT, 'templates/brand/goldkhata-horizontal.png')).href,
  words,
  scenes: spec.scenes.map((s) => ({ ...s, shot: s.shot ? toUrl(s.shot) : undefined })),
};
mkdirSync(path.join(REELS, '.work'), { recursive: true });
const video = path.join(REELS, '.work', `${spec.id}.video.mp4`);
const final = path.join(outDir, `${spec.id}.mp4`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(HERE, 'reel.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate((s) => window.setup(s), pageSpec);

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), video], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(total * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((x) => window.renderAt(x), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93, optimizeForSpeed: true });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) process.stdout.write(`\r  frames ${f}/${frames}`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on('close', (c) => (c ? j(new Error(`ffmpeg exited ${c}`)) : r())));

// Cover: the hook fully on screen, no captions.
await page.evaluate((s) => { window.setup({ ...s, words: [] }); }, pageSpec);
await page.evaluate((x) => window.renderAt(x), Math.min(spec.scenes[0].end - 0.05, 2.2));
await page.screenshot({ path: path.join(outDir, `${spec.id}_cover.jpg`), type: 'jpeg', quality: 92 });
await browser.close();
console.log(`\r  ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// 3. Sound: each voice line at its scene start, music bed ducked under the voice, loudness for Instagram.
const inputs = [], filters = [];
const voiced = spec.scenes.filter((s) => s.audio && s.start < total);
voiced.forEach((s, k) => {
  inputs.push('-i', s.audio);
  const ms = Math.round((s.start + VO_LEAD) * 1000);
  filters.push(`[${k + 1}:a]adelay=${ms}|${ms}[v${k}]`);
});
const music = spec.music ? path.resolve(REELS, spec.music) : null;
const args2 = ['-y', '-loglevel', 'error', '-i', video, ...inputs];
if (withAudio && voiced.length) {
  let mix = `${voiced.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voiced.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}[vo]`;
  if (music && existsSync(music)) {
    args2.push('-stream_loop', '-1', '-i', music);
    const m = voiced.length + 1;
    mix += `;[${m}:a]atrim=0:${total.toFixed(3)},volume=0.22,afade=t=in:d=0.8,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.6[bed]`
      + `;[vo]asplit[vo1][vo2];[bed][vo2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`
      + `;[vo1][duck]amix=inputs=2:normalize=0[pre]`;
  } else mix += ';[vo]anull[pre]';
  mix += ';[pre]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]';
  args2.push('-filter_complex', [...filters, mix].join(';'), '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
} else {
  args2.push('-map', '0:v');
}
args2.push('-c:v', 'copy', '-movflags', '+faststart', '-t', total.toFixed(3), final);
await new Promise((r, j) => spawn('ffmpeg', args2, { stdio: 'inherit' }).on('close', (c) => (c ? j(new Error(`ffmpeg mux exited ${c}`)) : r())));
console.log(`  ${path.relative(ROOT, final)}  ${total.toFixed(1)} s`);
