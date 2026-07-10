import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, createHistory } from '../shell.js';

test('normalize trims whitespace and lowercases', () => {
  assert.equal(normalize('  Help '), 'help');
});

test('normalize collapses inner whitespace runs', () => {
  assert.equal(normalize('sudo   rm   -rf'), 'sudo rm -rf');
});

test('normalize returns empty string for blank input', () => {
  assert.equal(normalize('   '), '');
});

test('history: prev walks back, next walks forward to fresh prompt', () => {
  const h = createHistory();
  h.push('help');
  h.push('skills');
  assert.equal(h.prev(), 'skills');
  assert.equal(h.prev(), 'help');
  assert.equal(h.next(), 'skills');
  assert.equal(h.next(), '');
});

test('history: prev at the oldest entry stays there', () => {
  const h = createHistory();
  h.push('help');
  assert.equal(h.prev(), 'help');
  assert.equal(h.prev(), 'help');
});

test('history: empty and consecutive duplicate commands are not stored', () => {
  const h = createHistory();
  h.push('help');
  h.push('');
  h.push('help');
  assert.equal(h.prev(), 'help');
  assert.equal(h.prev(), 'help');
});

test('history: push resets the cursor to the newest position', () => {
  const h = createHistory();
  h.push('help');
  h.prev();
  h.push('skills');
  assert.equal(h.prev(), 'skills');
});
