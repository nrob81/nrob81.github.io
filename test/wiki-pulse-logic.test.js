import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEligibleEvent,
  countryForWiki,
  isRenderable,
  articleUrl,
} from '../wiki-pulse-logic.js';

const TABLE = {
  huwiki: { name: 'Hungary', lat: 47.50, lng: 19.04 },
  enwiki: { name: 'United States', lat: 38.90, lng: -77.04 },
};

function baseEvent(overrides = {}) {
  return {
    wiki: 'huwiki',
    title: 'Komárom',
    namespace: 0,
    type: 'edit',
    bot: false,
    ...overrides,
  };
}

test('isEligibleEvent accepts a plain non-bot article edit', () => {
  assert.equal(isEligibleEvent(baseEvent()), true);
});

test('isEligibleEvent rejects bot edits', () => {
  assert.equal(isEligibleEvent(baseEvent({ bot: true })), false);
});

test('isEligibleEvent rejects non-article namespaces', () => {
  assert.equal(isEligibleEvent(baseEvent({ namespace: 1 })), false);
});

test('isEligibleEvent rejects log/categorize event types', () => {
  assert.equal(isEligibleEvent(baseEvent({ type: 'log' })), false);
  assert.equal(isEligibleEvent(baseEvent({ type: 'categorize' })), false);
});

test('isEligibleEvent accepts both edit and new event types', () => {
  assert.equal(isEligibleEvent(baseEvent({ type: 'new' })), true);
});

test('isEligibleEvent rejects wikis whose code does not end in "wiki" (e.g. wikidatawiki\'s sister project wikidata)', () => {
  assert.equal(isEligibleEvent(baseEvent({ wiki: 'wikidata' })), false);
});

test('isEligibleEvent allows non-Wikipedia *wiki-suffixed projects through (commons, etc.) — country lookup filters those out separately', () => {
  assert.equal(isEligibleEvent(baseEvent({ wiki: 'commonswiki' })), true);
});

test('isEligibleEvent rejects malformed events', () => {
  assert.equal(isEligibleEvent(null), false);
  assert.equal(isEligibleEvent({}), false);
  assert.equal(isEligibleEvent({ wiki: 42 }), false);
});

test('isEligibleEvent rejects events with a missing or non-string title', () => {
  assert.equal(isEligibleEvent(baseEvent({ title: undefined })), false);
  assert.equal(isEligibleEvent(baseEvent({ title: 42 })), false);
  assert.equal(isEligibleEvent(baseEvent({ title: '' })), false);
});

test('countryForWiki resolves a known code from the given table', () => {
  assert.deepEqual(countryForWiki('huwiki', TABLE), { name: 'Hungary', lat: 47.50, lng: 19.04 });
});

test('countryForWiki returns null for an unknown code, never a fallback', () => {
  assert.equal(countryForWiki('commonswiki', TABLE), null);
});

test('isRenderable requires both eligibility and a known country', () => {
  assert.equal(isRenderable(baseEvent({ wiki: 'huwiki' }), TABLE), true);
  assert.equal(isRenderable(baseEvent({ wiki: 'commonswiki' }), TABLE), false, 'unmapped wiki');
  assert.equal(isRenderable(baseEvent({ wiki: 'huwiki', bot: true }), TABLE), false, 'bot edit');
});

test('articleUrl builds a real wikipedia.org link with spaces as underscores', () => {
  assert.equal(
    articleUrl({ wiki: 'huwiki', title: 'Komárom vára' }),
    'https://hu.wikipedia.org/wiki/Kom%C3%A1rom_v%C3%A1ra'
  );
});

import {
  createPulseBudget,
  createRollingRate,
  pulseOpacity,
} from '../wiki-pulse-logic.js';

test('createPulseBudget admits up to maxPerSecond events instantly, then blocks', () => {
  const budget = createPulseBudget(3);
  const t0 = 1000;
  assert.equal(budget.tryConsume(t0), true);
  assert.equal(budget.tryConsume(t0), true);
  assert.equal(budget.tryConsume(t0), true);
  assert.equal(budget.tryConsume(t0), false, 'fourth event in the same instant should be dropped');
});

test('createPulseBudget refills over time', () => {
  const budget = createPulseBudget(2);
  const t0 = 1000;
  assert.equal(budget.tryConsume(t0), true);
  assert.equal(budget.tryConsume(t0), true);
  assert.equal(budget.tryConsume(t0), false);
  // half a second later, at 2/sec, one more token should be available
  assert.equal(budget.tryConsume(t0 + 500), true);
  assert.equal(budget.tryConsume(t0 + 500), false);
});

test('createRollingRate reports events per second over the trailing window', () => {
  const rate = createRollingRate(1000);
  const t0 = 5000;
  rate.record(t0);
  rate.record(t0 + 200);
  rate.record(t0 + 400);
  assert.equal(rate.rate(t0 + 400), 3, 'three events within the last 1000ms');
});

test('createRollingRate drops events that fall outside the trailing window', () => {
  const rate = createRollingRate(1000);
  rate.record(1000);
  rate.record(1200);
  assert.equal(rate.rate(2200), 1, 'only the event at 1200 is within 1000ms of 2200');
});

test('pulseOpacity is 1 at birth and fades linearly to 0 by fadeMs', () => {
  assert.equal(pulseOpacity(0, 2000), 1);
  assert.equal(pulseOpacity(1000, 2000), 0.5);
  assert.equal(pulseOpacity(2000, 2000), 0);
});

test('pulseOpacity clamps to 0 past fadeMs', () => {
  assert.equal(pulseOpacity(5000, 2000), 0);
});
