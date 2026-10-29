// Makes worker/worker.bundle.js: a single file with profile.json inlined,
// so you can paste it straight into the Cloudflare dashboard editor (no CLI needed).
import fs from 'node:fs';
const profile = fs.readFileSync('src/data/profile.json', 'utf8');
let src = fs.readFileSync('worker/worker.js', 'utf8');
const line = "import profile from '../src/data/profile.json';";
if (!src.includes(line)) throw new Error('import line not found in worker.js');
src = src.replace(line, `const profile = ${JSON.stringify(JSON.parse(profile))};`);
fs.writeFileSync('worker/worker.bundle.js', src);
console.log('OK -> worker/worker.bundle.js (paste into Cloudflare Worker editor)');
