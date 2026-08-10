// wiki-pulse-app.js
// DOM/network glue for the wiki pulse globe. Pure logic lives in
// wiki-pulse-logic.js; this file only wires it to the page and to the
// Wikimedia EventStreams feed.
import createGlobe from './vendor/cobe.js';
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

// Tracked separately from the canvas element's own width/height attributes:
// cobe reads render dimensions from `state.width`/`state.height` on every
// frame (see cobe's official demo, which mirrors these into onRender), it
// does not infer them from the canvas DOM element. `DPR` must match the
// `devicePixelRatio` passed to createGlobe below — cobe's underlying
// renderer (phenomenon) sets canvas.width/height itself using that same
// factor and owns gl.viewport sizing via its own resize listener, so this
// file must not also write canvas.width/height directly (that would fight
// phenomenon's own resize handling and leave the GL viewport stale).
const DPR = Math.min(window.devicePixelRatio || 1, 2);
let renderWidth = canvas.clientWidth * DPR;
let renderHeight = canvas.clientHeight * DPR;

// Pointer-drag rotation, following cobe's own documented pattern: auto-spin
// pauses while a drag is in progress, and the drag's horizontal movement is
// added to phi as a persistent offset once released — so the globe stays
// wherever the visitor left it instead of snapping back.
let pointerDown = false;
let pointerStartX = 0;
let dragPhiOffset = 0;
let dragStartOffset = 0;

canvas.style.cursor = 'grab';
canvas.style.touchAction = 'none'; // let pointer events drive dragging on touch, not page scroll

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true;
  pointerStartX = e.clientX;
  dragStartOffset = dragPhiOffset;
  canvas.style.cursor = 'grabbing';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  pointerDown = false;
  canvas.style.cursor = 'grab';
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = false;
  canvas.style.cursor = 'grab';
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  const deltaX = e.clientX - pointerStartX;
  dragPhiOffset = dragStartOffset + deltaX / 200;
});

let globe = null;
try {
  globe = createGlobe(canvas, {
    devicePixelRatio: DPR,
    width: renderWidth,
    height: renderHeight,
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
      if (!reducedMotion && !pointerDown) {
        phi += ROTATE_SPEED;
      }
      state.phi = phi + dragPhiOffset;
      state.width = renderWidth;
      state.height = renderHeight;

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
} catch (err) {
  console.error('wiki-pulse: failed to initialize globe', err);
  const wrap = document.getElementById('globe-wrap');
  if (wrap) {
    const p = document.createElement('p');
    p.className = 'globe-fallback';
    p.textContent = 'The 3D globe could not load, but the live ticker below still works.';
    wrap.appendChild(p);
  }
}

window.addEventListener('resize', () => {
  renderWidth = canvas.clientWidth * DPR;
  renderHeight = canvas.clientHeight * DPR;
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

// EventSource auto-reconnects and re-fires onerror on each failed attempt,
// racing against the 500ms display interval. Track connection state
// explicitly so the "connection lost" message persists for the whole time
// the stream is actually down, instead of being overwritten a moment later.
let connected = true;

function updateRateDisplay() {
  if (!connected) {
    rateEl.textContent = 'connection lost — retrying…';
    return;
  }
  const rate = rollingRate.rate(Date.now());
  rateEl.textContent = `~${Math.round(rate)} article edits/sec (mapped Wikipedias)`;
}
setInterval(updateRateDisplay, 500);

const source = new EventSource(STREAM_URL);
source.onopen = () => {
  connected = true;
};
source.onmessage = (msg) => {
  connected = true;

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
  connected = false;
};
