// wiki-pulse-app.js
// DOM/network glue for the wiki pulse globe. Pure logic lives in
// wiki-pulse-logic.js; this file only wires it to the page and to the
// Wikimedia EventStreams feed.
import createGlobe from 'https://esm.sh/cobe@0.6.3';
import {
  isRenderable,
  countryForWiki,
  articleUrl,
  createPulseBudget,
  createRollingRate,
  pulseOpacity,
} from './wiki-pulse-logic.js';

const STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';
const PULSE_BUDGET_PER_SEC = 8;
const PULSE_FADE_MS = 2500;
const BASE_MARKER_SIZE = 0.06;
const TICKER_MAX = 20;
const ROTATE_SPEED = 0.0022;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('globe-canvas');
const rateEl = document.getElementById('edit-rate');
const tickerEl = document.getElementById('ticker');

const budget = createPulseBudget(PULSE_BUDGET_PER_SEC);
const rollingRate = createRollingRate(1000);
const markers = []; // { lat, lng, bornAt }

let phi = 0;

const globe = createGlobe(canvas, {
  devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  width: canvas.clientWidth * 2,
  height: canvas.clientHeight * 2,
  phi: 0,
  theta: 0.3,
  dark: 1,
  diffuse: 1.2,
  mapSamples: 16000,
  mapBrightness: 6,
  baseColor: [0.3, 0.3, 0.32],
  markerColor: [0.95, 0.65, 0.24],
  glowColor: [0.3, 0.3, 0.32],
  markers: [],
  onRender(state) {
    if (!reducedMotion) {
      phi += ROTATE_SPEED;
    }
    state.phi = phi;

    const now = Date.now();
    for (let i = markers.length - 1; i >= 0; i--) {
      if (now - markers[i].bornAt >= PULSE_FADE_MS) markers.splice(i, 1);
    }
    state.markers = markers.map((m) => ({
      location: [m.lat, m.lng],
      size: reducedMotion ? BASE_MARKER_SIZE : BASE_MARKER_SIZE * pulseOpacity(now - m.bornAt, PULSE_FADE_MS),
    }));
  },
});

window.addEventListener('resize', () => {
  canvas.width = canvas.clientWidth * 2;
  canvas.height = canvas.clientHeight * 2;
});

function addMarker(event) {
  const country = countryForWiki(event.wiki);
  if (!country) return;
  markers.push({ lat: country.lat, lng: country.lng, bornAt: Date.now() });
}

function addTickerEntry(event) {
  const li = document.createElement('li');
  const lang = event.wiki.slice(0, -'wiki'.length);
  const a = document.createElement('a');
  a.href = articleUrl(event);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = event.title;
  const langSpan = document.createElement('span');
  langSpan.className = 'lang';
  langSpan.textContent = lang;
  li.append(langSpan, a);
  tickerEl.prepend(li);
  while (tickerEl.children.length > TICKER_MAX) {
    tickerEl.removeChild(tickerEl.lastChild);
  }
}

function updateRateDisplay() {
  const rate = rollingRate.rate(Date.now());
  rateEl.textContent = `~${Math.round(rate)} edits/sec worldwide`;
}
setInterval(updateRateDisplay, 500);

const source = new EventSource(STREAM_URL);
source.onmessage = (msg) => {
  let event;
  try {
    event = JSON.parse(msg.data);
  } catch (err) {
    return;
  }
  if (!isRenderable(event)) return;

  rollingRate.record(Date.now());
  if (!budget.tryConsume(Date.now())) return;

  addMarker(event);
  addTickerEntry(event);
};
source.onerror = () => {
  rateEl.textContent = 'connection lost — retrying…';
};
