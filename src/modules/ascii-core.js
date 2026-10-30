// Shared ASCII engine: rasterize text into a brightness grid, then draw it with characters.
// Used by the loader, the archive panel and the footer.

export const RAMP = ' .:-=+*#%@';
export const ASPECT = 1.9; // a character cell is ~1.9x taller than wide
const S = 6;               // sample px per column while rasterizing

let _c;
const scratch = () => (_c ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true }));

/** Decide how many rows are needed so `lines` fit `cols` columns tightly. */
export function measureRows({ lines, cols, font = 'Syne', weight = 800, widthRatio = 0.98, leading = 0.86, aspect = ASPECT }) {
  const c = scratch();
  c.font = `${weight} 100px "${font}"`;
  const maxW = Math.max(...lines.map((l) => c.measureText(l).width));
  const fs = (cols * S * widthRatio) / maxW * 100;
  const cap = c.measureText('H').actualBoundingBoxAscent * (fs / 100);
  const totalH = cap + (lines.length - 1) * leading * fs;
  return Math.ceil(totalH / (S * aspect)) + 2;
}

/** Returns Float32Array(cols*rows) of 0..1 coverage. Text is centered in the grid. */
export function rasterText({ lines, cols, rows, font = 'Syne', weight = 800, widthRatio = 0.98, leading = 0.86, aspect = ASPECT }) {
  const W = cols * S;
  const cellH = S * aspect;
  const H = Math.round(rows * cellH);
  const c = scratch();
  c.canvas.width = W;
  c.canvas.height = H;
  c.clearRect(0, 0, W, H);
  c.font = `${weight} 100px "${font}"`;
  const maxW = Math.max(...lines.map((l) => c.measureText(l).width));
  let fs = (W * widthRatio) / maxW * 100;
  const cap0 = c.measureText('H').actualBoundingBoxAscent;
  // shrink if it does not fit vertically
  const need = (cap0 * fs) / 100 + (lines.length - 1) * leading * fs;
  if (need > H * 0.96) fs *= (H * 0.96) / need;
  c.font = `${weight} ${fs}px "${font}"`;
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const cap = c.measureText('H').actualBoundingBoxAscent;
  const total = cap + (lines.length - 1) * leading * fs;
  const top = (H - total) / 2;
  lines.forEach((l, i) => c.fillText(l, W / 2, top + cap + i * leading * fs));
  const data = c.getImageData(0, 0, W, H).data;
  const out = new Float32Array(cols * rows);
  const ch = Math.floor(cellH);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0, n = 0;
      const y0 = Math.floor(y * cellH);
      for (let yy = y0; yy < Math.min(H, y0 + ch); yy++) {
        for (let xx = x * S; xx < x * S + S; xx++) { sum += data[(yy * W + xx) * 4 + 3]; n++; }
      }
      out[y * cols + x] = n ? sum / n / 255 : 0;
    }
  }
  return out;
}

export const hash = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };

/** Fit a canvas to its CSS width for a cols x rows character grid. Returns cell metrics. */
export function fitCanvas(canvas, cols, rows, maxDpr = 2) {
  const w = Math.max(1, canvas.clientWidth || canvas.parentElement.clientWidth);
  const cw = w / cols;
  const ch = cw * ASPECT;
  const h = rows * ch;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, cw, ch, w, h };
}
