// Optional: regenerates public/og.png (1200x630) and PNG icons.
// Needs Playwright:  npm i -D playwright && npx playwright install chromium && node scripts/make-og.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const p = JSON.parse(fs.readFileSync(path.join(root, 'src/data/profile.json'), 'utf8'));
const font = (f) => 'file://' + path.join(root, 'public/fonts', f);

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Syne;src:url('${font('syne.woff2')}');font-weight:400 800}
@font-face{font-family:MM;src:url('${font('martian-mono.woff2')}');font-weight:100 800}
@font-face{font-family:IS;src:url('${font('instrument-serif-italic.woff2')}');font-style:italic}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0a0a09;color:#ebe8de;position:relative;overflow:hidden;font-family:MM}
#field{position:absolute;inset:0;font-size:13px;line-height:15px;letter-spacing:.1em;color:#ebe8de;opacity:.16;white-space:pre;overflow:hidden}
.wrap{position:absolute;inset:48px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;justify-content:space-between;font-size:15px;letter-spacing:.16em;color:#ebe8de99}
.top b{color:#ff4a1c;font-weight:600}
h1{font-family:Syne;font-weight:800;font-size:200px;line-height:.82;letter-spacing:-.05em;text-transform:uppercase}
h1 span{display:block}
h1 span+span{color:transparent;-webkit-text-stroke:2.5px #ebe8de}
.bot{display:flex;justify-content:space-between;align-items:flex-end}
.tag{font-family:Syne;font-weight:700;font-size:38px;letter-spacing:-.03em}
.tag em{font-family:IS;font-weight:400;color:#ff4a1c;font-size:44px}
.url{font-size:16px;letter-spacing:.14em;color:#ebe8de99}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff4a1c;margin-right:10px}
</style></head><body><div id="field"></div><div class="wrap">
<div class="top"><span><b>//</b> SIG—001 / TRANSMISSION</span><span><i class="dot"></i>${p.status.toUpperCase()}</span></div>
<h1><span>${p.heroLines[0]}</span><span>${p.heroLines[1]}</span></h1>
<div class="bot"><div class="tag">${p.tagline.replace(/\*(.+?)\*/g, '<em>$1</em>')}</div><div class="url">${p.role.toUpperCase()}<br>${p.site.domain}</div></div></div>
<script>const R=' .:-=+*#%@';let s='';let seed=7;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
for(let y=0;y<44;y++){for(let x=0;x<130;x++)s+=r()<.35?R[1+Math.floor(r()*4)]:' ';s+='\\n'}
document.getElementById('field').textContent=s;</script></body></html>`;

const icon = (size) => `<!doctype html><html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="file://${path.join(root, 'public/favicon.svg')}"></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const tmp = path.join(root, 'scripts/.og-tmp.html'); fs.writeFileSync(tmp, og);
  await page.goto('file://' + tmp); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, 'public/og.png') });
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    await page.setViewportSize({ width: size, height: size });
    fs.writeFileSync(tmp, icon(size)); await page.goto('file://' + tmp); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(root, 'public', name), omitBackground: true });
  }
  fs.unlinkSync(tmp); await browser.close(); console.log('og + icons written to public/');
})();
