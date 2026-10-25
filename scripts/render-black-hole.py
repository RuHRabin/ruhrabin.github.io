"""Renders the hero image: a Schwarzschild black hole with a thin accretion disc.

Same physics the site describes: null geodesics integrated per pixel with the photon-orbit acceleration
a = -(3/2) h^2 r / r^5 (rs = 1), disc crossings found by sign changes of y, Doppler beaming (disc orbits at
v = sqrt(rs / 2r)) and gravitational redshift sqrt(1 - rs/r). Output is premultiplied-alpha so it sits on both themes.
"""
import sys, time
import numpy as np
from PIL import Image

W = H = int(sys.argv[1]) if len(sys.argv) > 1 else 720
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/bh_full.png'

D = 42.0                       # camera distance in rs
EL = np.radians(7.5)           # camera elevation above the disc plane (near edge-on)
ROLL = np.radians(-9.0)        # tilt of the whole picture
HALF = np.tan(np.radians(19.0))  # half field of view
R_IN, R_OUT = 3.0, 13.0        # disc: ISCO to outer edge (rs)
ALPHA_D = 0.82                 # disc opacity per crossing
STEPS = 1100

cam = np.array([0.0, D * np.sin(EL), D * np.cos(EL)], np.float32)
fwd = -cam / np.linalg.norm(cam)
right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
up = np.cross(right, fwd)
right_r = right * np.cos(ROLL) + up * np.sin(ROLL)
up_r = -right * np.sin(ROLL) + up * np.cos(ROLL)

ys, xs = np.mgrid[0:H, 0:W]
u = ((xs + 0.5) / W * 2 - 1).ravel().astype(np.float32)
v = (1 - (ys + 0.5) / H * 2).ravel().astype(np.float32)
N = u.size
d = fwd[None, :] + (u * HALF)[:, None] * right_r[None, :] + (v * HALF)[:, None] * up_r[None, :]
d /= np.linalg.norm(d, axis=1, keepdims=True)

pos = np.repeat(cam[None, :], N, axis=0).astype(np.float32)
vel = d.astype(np.float32)
h2 = np.sum(np.cross(pos, vel) ** 2, axis=1).astype(np.float32)

idx = np.arange(N)                       # which pixel each active ray belongs to
color = np.zeros((N, 3), np.float32)     # premultiplied emission
T = np.ones(N, np.float32)               # transmittance through the disc layers
captured = np.zeros(N, bool)

def acc(p, h2v):
    r2 = np.sum(p * p, axis=1)
    r5 = r2 * r2 * np.sqrt(r2)
    return -1.5 * (h2v / r5)[:, None] * p

def ramp(x):
    """Temperature-like value -> colour: deep orange, amber, pale yellow, near white."""
    x = np.clip(x, 0, 1.6)[:, None]
    stops = np.array([[0.0, 0.55, 0.12, 0.02], [0.35, 0.95, 0.38, 0.06], [0.75, 1.0, 0.72, 0.30], [1.15, 1.0, 0.93, 0.70], [1.6, 1.0, 1.0, 0.95]], np.float32)
    out = np.zeros((x.shape[0], 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(x[:, 0], stops[:, 0], stops[:, c + 1])
    return out

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

t0 = time.time()
for step in range(STEPS):
    if idx.size == 0:
        break
    r = np.linalg.norm(pos, axis=1)
    dt = np.clip(0.05 * r, 0.012, 1.4).astype(np.float32)[:, None]
    # RK4 on (pos, vel)
    k1p = vel; k1v = acc(pos, h2)
    k2p = vel + 0.5 * dt * k1v; k2v = acc(pos + 0.5 * dt * k1p, h2)
    k3p = vel + 0.5 * dt * k2v; k3v = acc(pos + 0.5 * dt * k2p, h2)
    k4p = vel + dt * k3v;       k4v = acc(pos + dt * k3p, h2)
    npos = pos + dt / 6 * (k1p + 2 * k2p + 2 * k3p + k4p)
    nvel = vel + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    nvel /= np.linalg.norm(nvel, axis=1, keepdims=True)

    # disc crossing
    cross = (pos[:, 1] * npos[:, 1]) < 0
    if cross.any():
        ci = np.nonzero(cross)[0]
        t = pos[ci, 1] / (pos[ci, 1] - npos[ci, 1])
        p = pos[ci] + (npos[ci] - pos[ci]) * t[:, None]
        rr = np.hypot(p[:, 0], p[:, 2])
        hit = (rr >= R_IN) & (rr <= R_OUT)
        if hit.any():
            hi = ci[hit]; p = p[hit]; rr = rr[hit]
            vv = vel[hi] + (nvel[hi] - vel[hi]) * t[hit][:, None]
            vv /= np.linalg.norm(vv, axis=1, keepdims=True)
            n = -vv                                           # photon direction toward the camera
            beta_m = np.sqrt(0.5 / rr)
            phi = np.stack([-p[:, 2], np.zeros_like(rr), p[:, 0]], axis=1) / rr[:, None]
            beta = beta_m[:, None] * phi
            g_dop = np.sqrt(1 - beta_m ** 2) / (1 - np.sum(beta * n, axis=1))
            g_grav = np.sqrt(np.maximum(1 - 1.0 / rr, 1e-3))
            g = g_dop * g_grav
            em = (3.0 / rr) ** 2.1 * (0.20 + 0.80 * smooth(3.0, 4.6, rr)) * smooth(R_OUT, R_OUT - 4.0, rr)
            inten = 1 - np.exp(-em * g ** 3.4 * 5.0)
            col = ramp(g * (3.0 / rr) ** 0.28 * 1.05)
            gid = idx[hi]
            color[gid] += (T[gid] * inten)[:, None] * col
            T[gid] *= (1 - ALPHA_D * np.clip(inten * 1.6, 0, 1))

    pos, vel = npos, nvel
    rn = np.linalg.norm(pos, axis=1)
    dead_cap = rn < 1.0
    dead_esc = (rn > 48.0) & (np.sum(pos * vel, axis=1) > 0)
    captured[idx[dead_cap]] = True
    keep = ~(dead_cap | dead_esc)
    if not keep.all():
        idx = idx[keep]; pos = pos[keep]; vel = vel[keep]; h2 = h2[keep]
    if step % 100 == 0:
        print(f'step {step:4d}  active {idx.size:7d}  {time.time() - t0:5.1f}s', flush=True)

# rays still alive after the step budget are orbiting the photon sphere: treat as captured
captured[idx] = True

alpha = 1 - T
alpha[captured] = 1.0
img = np.concatenate([color, alpha[:, None]], axis=1).reshape(H, W, 4)

def blur(a, sigma):
    k = int(sigma * 3) * 2 + 1
    x = np.arange(k) - k // 2
    g = np.exp(-(x ** 2) / (2 * sigma ** 2)); g /= g.sum()
    out = np.apply_along_axis(lambda m: np.convolve(m, g, mode='same'), 0, a)
    return np.apply_along_axis(lambda m: np.convolve(m, g, mode='same'), 1, out)

# soft bloom: a wide glow of the disc light, added as premultiplied colour + a little alpha
emis = img[..., :3].copy()
glow = np.stack([blur(emis[..., c], W * 0.035) for c in range(3)], axis=-1) * 0.62
glow2 = np.stack([blur(emis[..., c], W * 0.012) for c in range(3)], axis=-1) * 0.38
bloom = glow + glow2
bl_alpha = np.clip(bloom.max(axis=-1) * 0.9, 0, 1)
# the black shadow stays black: bloom is added only outside fully captured pixels' coverage
cov = img[..., 3]
out_rgb = img[..., :3] * 1.0 + bloom * (1 - cov[..., None]) * 0.62
out_a = np.clip(cov + bl_alpha * (1 - cov), 0, 1)
out_rgb = np.minimum(out_rgb, out_a[..., None])        # premultiplied: rgb <= alpha

straight = np.where(out_a[..., None] > 1e-4, out_rgb / np.maximum(out_a[..., None], 1e-4), 0)
rgba = np.concatenate([np.clip(straight, 0, 1), out_a[..., None]], axis=-1)
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT)
print('saved', OUT, f'in {time.time() - t0:.1f}s')
