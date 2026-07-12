import { pointerToTilt, lerp } from './tilt.js';

const MAX_TILT_DEG = 2.5;
const SMOOTHING = 0.08; // low = the plane follows slowly, like a heavy plate
const SETTLE_DEG = 0.01;

const bg = document.getElementById('bg3d');
const finePointer = matchMedia('(pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (bg && finePointer.matches && !reducedMotion.matches) {
    let target = { rotateX: 0, rotateY: 0 };
    const current = { rotateX: 0, rotateY: 0 };
    let rafId = 0;

    function frame() {
        current.rotateX = lerp(current.rotateX, target.rotateX, SMOOTHING);
        current.rotateY = lerp(current.rotateY, target.rotateY, SMOOTHING);
        bg.style.setProperty('--tilt-x', `${current.rotateX}deg`);
        bg.style.setProperty('--tilt-y', `${current.rotateY}deg`);
        const settled = Math.abs(current.rotateX - target.rotateX) < SETTLE_DEG
            && Math.abs(current.rotateY - target.rotateY) < SETTLE_DEG;
        rafId = settled ? 0 : requestAnimationFrame(frame);
    }

    function retarget(tilt) {
        target = tilt;
        if (!rafId) rafId = requestAnimationFrame(frame);
    }

    document.addEventListener('pointermove', (event) => {
        retarget(pointerToTilt(event.clientX, event.clientY, innerWidth, innerHeight, MAX_TILT_DEG));
    });

    // Ease back to flat when the cursor leaves the window.
    document.addEventListener('pointerleave', () => {
        retarget({ rotateX: 0, rotateY: 0 });
    });
}
