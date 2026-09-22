// Voice for one reel: node engine/voice.mjs scripts/<id>.json
// ElevenLabs "Vanishree" (owner's choice, 2026-07-26), with per-character timings for the captions.
// Writes voice/<id>/<scene>.mp3 + .json; lines that have not changed are not re-generated (costs credits).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_ID = 'TmPeb2hSxdVrThJLywkg';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };

const envFile = path.join(REELS, '.env');
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY missing (reels/.env)'); process.exit(1); }

const spec = JSON.parse(readFileSync(path.resolve(REELS, process.argv[2]), 'utf8'));
const dir = path.join(REELS, 'voice', spec.id);
mkdirSync(dir, { recursive: true });
const lines = spec.scenes.map((s) => s.vo || '');

for (const [i, text] of lines.entries()) {
  if (!text) continue;
  const jsonPath = path.join(dir, `${i}.json`);
  if (existsSync(jsonPath) && JSON.parse(readFileSync(jsonPath, 'utf8')).text === text) continue;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: SETTINGS,
      previous_text: lines.slice(0, i).filter(Boolean).join(' ') || undefined,
      next_text: lines.slice(i + 1).filter(Boolean).join(' ') || undefined,
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  writeFileSync(path.join(dir, `${i}.mp3`), Buffer.from(j.audio_base64, 'base64'));
  writeFileSync(jsonPath, JSON.stringify({ text, alignment: j.alignment }, null, 1));
  console.log(`  scene ${i}: ${j.alignment.character_end_times_seconds.at(-1).toFixed(2)} s  "${text.slice(0, 60)}"`);
}
