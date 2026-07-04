const fs = require("fs");

const htmlPath = "index.html";
let h = fs.readFileSync(htmlPath, "utf8");

const start = h.indexOf("const DATA = ");
const end = h.indexOf("/* ---------- state");
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

if (list.length !== 359) {
  console.error("MISMATCH: expected 359 unique sentences, got", list.length);
  process.exit(1);
}

// Build base64 AUDIO array from audio/opt/{idx}.mp3
const AUDIO = list.map((_, i) => {
  const buf = fs.readFileSync(`audio/opt/${i}.mp3`);
  return buf.toString("base64");
});

const newBlock =
  "const DATA = " + JSON.stringify(DATA) + ";\n" +
  "const AUDIO = " + JSON.stringify(AUDIO) + ";";

h = h.slice(0, start) + newBlock + "\n" + h.slice(end);
fs.writeFileSync(htmlPath, h);

console.log("Injected DATA (with audio idx) + AUDIO array.");
console.log("Unique audio clips:", AUDIO.length);
console.log("New file size:", (fs.statSync(htmlPath).size / 1024 / 1024).toFixed(2), "MB");
