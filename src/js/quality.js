/* Adaptive quality governor for the black-hole shader.
 *
 * Resolution is reduced first, then ray-march STEPS (140..260). Frame times
 * come from requestAnimationFrame deltas, which cannot tell "the GPU is slow"
 * apart from "the browser or OS is capping rAF" (iOS Low Power Mode, battery
 * savers, 30 Hz displays). A capped device shows about 33 ms frames no matter
 * what we render, so lowering quality can never fix it and it used to ratchet
 * down to 0.5x and stay there.
 *
 * Fix: after a reduction, check that frame time actually improved. If two
 * reductions in a row bring no gain and the average sits at a ~30 Hz cadence,
 * treat the device as capped, restore full quality and stop degrading until
 * the frame time moves away from the cap.
 *
 * Pure module (no DOM, no three.js) so it can be tested in Node.
 */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const CAP_LO = 28;      /* ms: a ~30 Hz cadence is 33.3 ms */
const CAP_HI = 38;
const GAIN = 0.9;       /* a reduction "helped" if avg dropped below 90% of before */

export function createQuality({ onScale = () => {}, onSteps = () => {} } = {}) {
    return {
        scale: 1, steps: 200, avg: 0, capped: false, capAvg: 0,
        win: 0, sum: 0, skip: 0, hold: 0, fast: 0, slow: 0,
        prevAvg: 0, lastDown: false, noGain: 0, descentBase: 0,

        label() { return (this.capped ? 'capped ' : 'auto ') + this.scale.toFixed(1) + 'x'; },

        setSteps(n) {
            this.steps = n;
            onSteps(n);
            this.hold = 8;
            this.skip = 5;
        },

        setScale(s) {
            this.scale = Math.round(clamp(s, 0.5, 1) * 10) / 10;
            onScale(this.scale);
            this.skip = 5;
        },

        sample(ms) {
            if (ms > 250) return;
            if (this.skip > 0) { this.skip--; return; }
            this.sum += ms; this.win++;
            if (this.win < 30) return;

            const avg = this.sum / this.win;
            this.avg = avg; this.sum = 0; this.win = 0;
            if (this.hold > 0) this.hold--;

            /* Did the previous reduction help? */
            if (this.lastDown) {
                this.lastDown = false;
                if (avg > this.prevAvg * GAIN) this.noGain++; else this.noGain = 0;
                /* Require no gain across the WHOLE descent, not just the last two steps:
                   a GPU-bound device on a 60 Hz display moves in vsync steps
                   (50 -> 33 -> 33 -> 16 ms), so two flat steps in a row are normal. */
                if (this.noGain >= 2 && avg >= CAP_LO && avg <= CAP_HI && avg > this.descentBase * GAIN) {
                    this.capped = true; this.capAvg = avg; this.noGain = 0; this.descentBase = 0;
                    this.fast = 0; this.slow = 0;
                    if (this.scale !== 1) this.setScale(1);
                    if (this.steps !== 200) this.setSteps(200);
                    return;
                }
            }

            /* While capped, hold still until frame time leaves the cap. */
            if (this.capped) {
                if (avg < this.capAvg * 0.6 || avg > this.capAvg * 1.35) { this.capped = false; this.noGain = 0; this.descentBase = 0; }
                else return;
            }

            if (avg > 22) {
                this.fast = 0;
                let acted = false;
                if (this.steps > 200 && this.hold === 0) { this.setSteps(200); acted = true; }
                else if (this.scale > 0.5) { this.setScale(this.scale - 0.1); acted = true; }
                else if (this.steps > 140 && ++this.slow >= 2 && this.hold === 0) { this.slow = 0; this.setSteps(140); acted = true; }
                if (acted) {
                    if (this.descentBase === 0) this.descentBase = avg;
                    this.prevAvg = avg; this.lastDown = true;
                }
            } else if (avg < 14) {
                this.slow = 0; this.noGain = 0; this.descentBase = 0;
                if (this.scale < 1) this.setScale(this.scale + 0.1);
                else if (this.steps < 200 && this.hold === 0) this.setSteps(200);
                else if (avg < 9 && ++this.fast >= 4 && this.steps === 200 && this.hold === 0) { this.fast = 0; this.setSteps(260); }
            } else { this.fast = 0; this.slow = 0; this.noGain = 0; this.descentBase = 0; }
        },
    };
}
