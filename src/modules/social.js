// Social buttons (feel inspired by messenger.abeto.co): round, magnetic, icon swaps to an ASCII glyph.
// Email button: click COPIES the address. Long-press (0.55s) or Shift/Ctrl/Cmd-click opens the mail app.

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => legacy(text));
  return Promise.resolve(legacy(text));
}
function legacy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}

let toastTimer;
export function toast(msg) {
  const el = document.querySelector('[data-toast]');
  if (!el) return;
  el.textContent = msg; el.classList.add('is-on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 1600);
}

export function initSocial({ sound }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // magnetic pull (tiny rAF lerp, no library)
  if (fine && !reduced) {
    const items = [...document.querySelectorAll('[data-magnetic]')].map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0 }));
    let running = false, mx = -999, my = -999, queued = false;
    const step = () => {
      let moving = false;
      items.forEach((it) => {
        it.x += (it.tx - it.x) * 0.18; it.y += (it.ty - it.y) * 0.18;
        if (Math.abs(it.tx - it.x) > 0.05 || Math.abs(it.ty - it.y) > 0.05) moving = true;
        it.el.style.transform = `translate3d(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px, 0)`;
      });
      running = moving;
      if (moving) requestAnimationFrame(step);
    };
    const update = () => {
      queued = false;
      items.forEach((it) => {
        const r = it.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(mx - cx, my - cy);
        if (d < 90) { it.tx = (mx - cx) * 0.38; it.ty = (my - cy) * 0.38; } else { it.tx = 0; it.ty = 0; }
      });
      if (!running) { running = true; requestAnimationFrame(step); }
    };
    addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  }

  // email button: copy (click) / open (long-press or modifier)
  const mail = document.querySelector('[data-social="mail"]');
  if (mail) {
    const addr = mail.dataset.email;
    const tip = mail.querySelector('[data-tip-mail]');
    let pressTimer = 0, longPressed = false;
    const done = () => {
      mail.classList.add('is-copied'); tip.textContent = 'COPIED!';
      sound.play('copy');
      setTimeout(() => { mail.classList.remove('is-copied'); tip.textContent = 'COPY EMAIL'; }, 1500);
    };
    mail.addEventListener('pointerdown', () => { longPressed = false; pressTimer = setTimeout(() => { longPressed = true; location.href = 'mailto:' + addr; }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => mail.addEventListener(ev, () => clearTimeout(pressTimer)));
    mail.addEventListener('click', (e) => {
      if (longPressed) { e.preventDefault(); return; }
      if (e.shiftKey || e.metaKey || e.ctrlKey) return; // let mailto: happen
      e.preventDefault();
      copyText(addr).then(done);
    });
  }

  // contact section rows: click to copy
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const state = btn.querySelector('[data-copy-state]');
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copy).then(() => {
        btn.classList.add('is-copied'); state.textContent = 'COPIED!'; sound.play('copy'); toast('COPIED TO CLIPBOARD');
        setTimeout(() => { btn.classList.remove('is-copied'); state.textContent = 'COPY'; }, 1600);
      });
    });
  });
}
