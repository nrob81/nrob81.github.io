// Pure math for the 3D background tilt; DOM wiring lives in bg3d.js.
// CSS 3D axes: positive rotateX brings the bottom edge toward the viewer,
// positive rotateY pushes the right edge away — so nx is flipped (left
// positive) to make the edge under the cursor lean closer. Flipping inside
// the normalization also keeps the center value at +0, never -0.

export function pointerToTilt(x, y, width, height, maxDeg) {
    const nx = 1 - (x / width) * 2;  // +1 left .. -1 right
    const ny = (y / height) * 2 - 1; // -1 top .. +1 bottom
    return {
        rotateX: ny * maxDeg,
        rotateY: nx * maxDeg,
    };
}

export function lerp(current, target, factor) {
    return current + (target - current) * factor;
}
