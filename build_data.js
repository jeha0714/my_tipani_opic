/* DATA 에 오디오 인덱스를 주입하고, TTS 산출물을 정적 파일로 배치한다.
   과거에는 mp3 를 base64 로 index.html 에 인라인했으나(8.3MB), Vercel 의
   Fast Origin/Data Transfer 를 크게 잡아먹어 개별 파일 서빙으로 전환했다.
   재생 경로는 index.html 의 playAudio() 와 sw.js 의 캐시 규칙에 맞춰 /audio/v1/{idx}.mp3 로 고정한다.
   오디오를 재생성해 내용이 바뀌면 AUDIO_DIR 을 v2 로 올리고
   index.html·sw.js·vercel.json 의 경로도 함께 올릴 것 (immutable 캐시 때문). */
const fs = require("fs");
const path = require("path");

const htmlPath = "index.html";
const SRC_DIR = "audio/opt";
const AUDIO_DIR = "audio/v1";
const EXPECTED = 359;

let h = fs.readFileSync(htmlPath, "utf8");

const start = h.indexOf("const DATA = ");
const end = h.indexOf("/* ---------- state");
if (start < 0 || end < 0) {
  console.error("index.html 에서 DATA 블록을 찾지 못했습니다.");
  process.exit(1);
}
let src = h.slice(start, end).trim();
if (src.endsWith(";")) src = src.slice(0, -1);
src = src.replace(/^const DATA = /, "");
let DATA;
eval("DATA=" + src);

// Rebuild the same unique-sentence index used for TTS generation
const seen = new Map();
const list = [];
function idxFor(text) {
  if (seen.has(text)) return seen.get(text);
  const i = list.length;
  list.push(text);
  seen.set(text, i);
  return i;
}

for (const d of DATA.days) {
  d.s = d.s.map(([num, kr, en]) => [num, kr, en, idxFor(en)]);
  d.p = d.p.map(([q, a]) => [q, a, idxFor(a)]);
}
DATA.bonus = DATA.bonus.map(([kr, en]) => [kr, en, idxFor(en)]);

if (list.length !== EXPECTED) {
  console.error(`MISMATCH: expected ${EXPECTED} unique sentences, got`, list.length);
  process.exit(1);
}

// mp3 를 audio/v1/{idx}.mp3 로 배치. 이미 있고 내용이 같으면 건너뛴다.
if (!fs.existsSync(SRC_DIR)) {
  console.error(`${SRC_DIR} 가 없습니다. gen_tts.py 로 오디오를 먼저 생성하세요.`);
  process.exit(1);
}
fs.mkdirSync(AUDIO_DIR, { recursive: true });

let copied = 0, kept = 0, bytes = 0;
list.forEach((_, i) => {
  const from = path.join(SRC_DIR, `${i}.mp3`);
  const to = path.join(AUDIO_DIR, `${i}.mp3`);
  const buf = fs.readFileSync(from);
  bytes += buf.length;
  if (fs.existsSync(to) && fs.readFileSync(to).equals(buf)) { kept++; return; }
  fs.writeFileSync(to, buf);
  copied++;
});

// 인덱스가 줄어든 경우 남아 있는 옛 파일 제거
for (const f of fs.readdirSync(AUDIO_DIR)) {
  const m = f.match(/^(\d+)\.mp3$/);
  if (m && +m[1] >= list.length) fs.unlinkSync(path.join(AUDIO_DIR, f));
}

const newBlock = "const DATA = " + JSON.stringify(DATA) + ";";
h = h.slice(0, start) + newBlock + "\n" + h.slice(end);
fs.writeFileSync(htmlPath, h);

console.log("Injected DATA (with audio idx). AUDIO array is no longer inlined.");
console.log(`Audio clips: ${list.length}  (copied ${copied}, unchanged ${kept})`);
console.log(`Audio total: ${(bytes / 1024 / 1024).toFixed(2)} MB in ${AUDIO_DIR}/`);
console.log("index.html size:", (fs.statSync(htmlPath).size / 1024).toFixed(1), "KB");
