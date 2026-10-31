// Optional: regenerates public/og.png (1200x630) and PNG icons.
// Needs Playwright:  npm i -D playwright && npx playwright install chromium && node scripts/make-og.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const p = JSON.parse(fs.readFileSync(path.join(root, 'src/data/profile.json'), 'utf8'));
const font = (f) => 'file://' + path.join(root, 'public/fonts', f);

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:JB;src:url('${font('jetbrains-mono.woff2')}');font-weight:100 800}
@font-face{font-family:IS;src:url('${font('instrument-serif-italic.woff2')}');font-style:italic}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#070a0e;color:#dbe6f0;position:relative;overflow:hidden;font-family:JB}
.glow{position:absolute;inset:0;background:radial-gradient(60% 60% at 85% 10%,rgba(61,220,151,.22),transparent 70%),radial-gradient(50% 50% at 5% 100%,rgba(89,200,255,.16),transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(219,230,240,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(219,230,240,.07) 1px,transparent 1px);background-size:60px 60px}
.win{position:absolute;right:56px;bottom:120px;width:430px;border:1px solid rgba(219,230,240,.24);border-radius:8px;background:rgba(13,19,26,.85);overflow:hidden}
.bar{display:flex;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(219,230,240,.13)}
.bar i{width:11px;height:11px;border-radius:2px;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
.body{padding:16px 18px;font-size:17px;line-height:1.9;color:#dbe6f0}.body .p{color:#3ddc97}.body .o{color:rgba(219,230,240,.56)}
.wrap{position:absolute;inset:52px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;justify-content:space-between;font-size:15px;letter-spacing:.16em;color:rgba(219,230,240,.56)}
.top b{color:#3ddc97;font-weight:600}
h1{font-weight:800;font-size:215px;line-height:.8;letter-spacing:-.065em;text-transform:uppercase}
h1 span{display:block}h1 span+span{color:transparent;-webkit-text-stroke:2.5px #dbe6f0}
.tag{font-weight:700;font-size:30px;letter-spacing:-.04em}.tag em{font-family:IS;font-weight:400;color:#3ddc97;font-size:36px}
</style></head><body><div class="glow"></div><div class="grid"></div><div class="wrap">
<div class="top"><span><b>rabin@ruhrbin</b>:~$ ./hello</span><span>${p.status.toUpperCase()}</span></div>
<h1><span>${p.heroLines[0]}</span><span>${p.heroLines[1]}</span></h1>
<div class="tag">${p.role} <span style="opacity:.5">/ ${p.site.domain}</span></div></div>
<div class="win"><div class="bar"><i></i><i></i><i></i></div><div class="body"><div><span class="p">$</span> whoami</div><div class="o">${p.name.toLowerCase().replace(/\s+/g, '-')}</div><div><span class="p">$</span> cat role.txt</div><div class="o">${(p.roles||[]).join(' · ')}</div></div></div>
</body></html>`;

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
