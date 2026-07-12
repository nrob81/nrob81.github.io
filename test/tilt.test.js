import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerToTilt, lerp } from '../tilt.js';

test('pointer at center leaves the plane flat', () => {
  const t = pointerToTilt(400, 300, 800, 600, 3);
  // strict equal distinguishes -0 from +0: the implementation must
  // return a true zero at center, not a negated one.
  assert.equal(t.rotateX, 0);
  assert.equal(t.rotateY, 0);
});

test('pointer in the bottom-right corner tilts that corner closer', () => {
  const t = pointerToTilt(800, 600, 800, 600, 3);
  assert.equal(t.rotateX, 3);   // positive rotateX: bottom edge closer
  assert.equal(t.rotateY, -3);  // negative rotateY: right edge closer
});

test('pointer in the top-left corner tilts that corner closer', () => {
  const t = pointerToTilt(0, 0, 800, 600, 3);
  assert.equal(t.rotateX, -3);
  assert.equal(t.rotateY, 3);
});

test('tilt scales linearly between center and edge', () => {
  const t = pointerToTilt(600, 300, 800, 600, 3);
  assert.equal(t.rotateX, 0);
  assert.equal(t.rotateY, -1.5);
});

test('lerp moves the given fraction toward the target', () => {
  assert.equal(lerp(0, 10, 0.1), 1);
  assert.equal(lerp(5, 5, 0.1), 5);
});
