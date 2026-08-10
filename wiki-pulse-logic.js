// wiki-pulse-logic.js
// Pure functions only — no DOM, no fetch. Imported by wiki-pulse-app.js and
// by test/wiki-pulse-logic.test.js.
import { WIKI_COUNTRIES } from './wiki-pulse-countries.js';

export function isEligibleEvent(event) {
  if (!event || typeof event.wiki !== 'string') return false;
  if (!event.wiki.endsWith('wiki')) return false;
  if (event.namespace !== 0) return false;
  if (event.type !== 'edit' && event.type !== 'new') return false;
  if (event.bot) return false;
  return true;
}

export function countryForWiki(wikiCode, table = WIKI_COUNTRIES) {
  return table[wikiCode] || null;
}

export function isRenderable(event, table = WIKI_COUNTRIES) {
  return isEligibleEvent(event) && countryForWiki(event.wiki, table) !== null;
}

export function articleUrl(event) {
  const lang = event.wiki.slice(0, -'wiki'.length);
  const domain = `${lang}.wikipedia.org`;
  const path = encodeURIComponent(event.title.replace(/ /g, '_'));
  return `https://${domain}/wiki/${path}`;
}

export function createPulseBudget(maxPerSecond) {
  let tokens = maxPerSecond;
  let lastRefill = null;
  return {
    tryConsume(nowMs) {
      if (lastRefill === null) lastRefill = nowMs;
      const elapsedSec = (nowMs - lastRefill) / 1000;
      tokens = Math.min(maxPerSecond, tokens + elapsedSec * maxPerSecond);
      lastRefill = nowMs;
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    },
  };
}

export function createRollingRate(windowMs = 1000) {
  const timestamps = [];
  function prune(nowMs) {
    while (timestamps.length && timestamps[0] < nowMs - windowMs) timestamps.shift();
  }
  return {
    record(nowMs) {
      timestamps.push(nowMs);
      prune(nowMs);
    },
    rate(nowMs) {
      prune(nowMs);
      return timestamps.length / (windowMs / 1000);
    },
  };
}

export function pulseOpacity(elapsedMs, fadeMs = 2500) {
  if (elapsedMs <= 0) return 1;
  if (elapsedMs >= fadeMs) return 0;
  return 1 - elapsedMs / fadeMs;
}
