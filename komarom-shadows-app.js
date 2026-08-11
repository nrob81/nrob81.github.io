// Shared DOM/network wiring for the Komárom shadow map, reused by every
// language variant (komarom-shadows*.html). Each HTML file sets
// window.KOMAROM_STRINGS before loading this as a module, so all
// user-visible runtime text is localized without duplicating this logic.
import {
  sunPosition,
  sunriseSunset,
  buildingShadowPolygon,
  estimateBuildingHeight,
  isCacheStale,
  shadowOpacity,
  duskIntensity,
  downloadProgress,
  renderProgress,
  toCacheableElement,
  isTransientHttpStatus,
  retryDelayMs,
} from './komarom-shadows-logic.js';

const STRINGS = window.KOMAROM_STRINGS;

const KOMARNO_CENTER = [47.7574, 18.1298];
// Bounding box for the visible urban area, intersected below with the real
// Komárno town boundary (OSM relation 2218900) so the Overpass query never
// pulls in Hungary across the Danube or the outlying west/east districts.
const BBOX = { south: 47.7480, west: 18.0950, north: 47.7850, east: 18.1650 };
const KOMARNO_TOWN_AREA_ID = 3602218900;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BUILDINGS_CACHE_KEY = 'komarom_shadows_buildings_v3';

// Earlier versions of this page cached (untrimmed, then trimmed) building
// data straight in localStorage before this ever hit a real browser's
// quota — clear out any leftovers so they don't sit around unused.
for (const key of ['komarom_shadows_buildings_v1', 'komarom_shadows_buildings_v2', 'komarom_shadows_buildings_v3']) {
  try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
}

const statusEl = document.getElementById('status');
const loadingOverlayEl = document.getElementById('loading-overlay');
const loadingTextEl = document.getElementById('loading-text');

function setStatus(text) {
  statusEl.textContent = text;
  loadingTextEl.textContent = text;
}
const duskOverlayEl = document.getElementById('dusk-overlay');

// Keep the map framed on the town, not zoomable out to the country/world.
const MAP_BOUNDS = L.latLngBounds(
  [BBOX.south - 0.01, BBOX.west - 0.01],
  [BBOX.north + 0.01, BBOX.east + 0.01]
);

const map = L.map('map', {
  preferCanvas: true,
  minZoom: 13,
  maxBounds: MAP_BOUNDS,
  maxBoundsViscosity: 1.0,
}).setView(KOMARNO_CENTER, 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

setStatus(STRINGS.mapReady);

// Building data (a few MB even trimmed) routinely blows past localStorage's
// ~5-10MB per-origin quota. IndexedDB's quota is a share of free disk space,
// so it's the right store for a payload this size.
const CACHE_DB_NAME = 'komarom-shadows';
const CACHE_STORE = 'buildings';

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedBuildings() {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(BUILDINGS_CACHE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('komarom-shadows: could not read building cache:', err);
    return null;
  }
}

async function setCachedBuildings(fetchedAt, elements) {
  try {
    const db = await openCacheDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put({ fetchedAt, elements }, BUILDINGS_CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('komarom-shadows: could not cache building data (page will just refetch next visit):', err);
  }
}

async function fetchBuildingElements() {
  const cached = await getCachedBuildings();
  if (
    cached &&
    typeof cached.fetchedAt === 'number' &&
    Array.isArray(cached.elements) &&
    !isCacheStale(cached.fetchedAt, Date.now())
  ) {
    return cached.elements;
  }

  const query = `[out:json][timeout:25];area(${KOMARNO_TOWN_AREA_ID})->.a;way["building"](area.a)(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});out geom;`;
  const MAX_ATTEMPTS = 3;
  let response;
  for (let attempt = 0; ; attempt++) {
    setStatus(STRINGS.downloading(downloadProgress(0, 0)));
    response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (response.ok) break;
    if (!isTransientHttpStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
      throw new Error(`Overpass fetch failed: ${response.status}`);
    }
    setStatus(STRINGS.overpassBusy(response.status));
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
  }

  const totalBytes = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.length;
    setStatus(STRINGS.downloading(downloadProgress(loadedBytes, totalBytes)));
  }
  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  const elements = data.elements;

  const cacheable = elements.filter((el) => el.geometry).map(toCacheableElement);
  await setCachedBuildings(Date.now(), cacheable);
  return elements;
}

const buildings = [];

function renderShadowsForTime(date) {
  const { altitude, azimuth } = sunPosition(date, KOMARNO_CENTER[0], KOMARNO_CENTER[1]);
  const opacity = shadowOpacity(altitude);
  for (const b of buildings) {
    const shadowCoords = buildingShadowPolygon(b.footprint, b.heightM, altitude, azimuth);
    if (shadowCoords) {
      if (b.shadowLayer) {
        b.shadowLayer.setLatLngs(shadowCoords);
        b.shadowLayer.setStyle({ fillOpacity: opacity });
      } else {
        b.shadowLayer = L.polygon(shadowCoords, {
          color: 'transparent',
          fillColor: '#1b1813',
          fillOpacity: opacity,
          interactive: false,
        }).addTo(map);
        b.shadowLayer.bringToBack();
      }
    } else if (b.shadowLayer) {
      map.removeLayer(b.shadowLayer);
      b.shadowLayer = null;
    }
  }
  duskOverlayEl.style.opacity = String(duskIntensity(altitude) * 0.85);
}

const sliderEl = document.getElementById('time-slider');
const timeLabelEl = document.getElementById('time-label');
const dateEl = document.getElementById('date-picker');

// The sun-position formulas are only verified accurate for 1950-2050 (see
// komarom-shadows-logic.js header), so the date picker doesn't offer dates
// outside that range.
const EARLIEST_DATE = '1950-01-01';
const LATEST_DATE = '2050-12-31';

function formatTime(date) {
  return date.toLocaleTimeString(STRINGS.locale, { hour: '2-digit', minute: '2-digit' });
}

function todayAtUTCMidnight() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatDateForInput(date) {
  return date.toISOString().slice(0, 10);
}

function dateInputToUTCMidnight(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Recomputes sunrise/sunset for the given day and moves the slider to
// preferredTimeMs (or "now", clamped to daylight) if provided.
function applyDate(dateAtMidnightUTC, preferredTimeMs) {
  const { sunrise, sunset } = sunriseSunset(dateAtMidnightUTC, KOMARNO_CENTER[0], KOMARNO_CENTER[1]);

  sliderEl.min = String(sunrise.getTime());
  sliderEl.max = String(sunset.getTime());
  sliderEl.step = '60000';

  const target = preferredTimeMs != null ? preferredTimeMs : Date.now();
  const clamped = Math.min(Math.max(target, sunrise.getTime()), sunset.getTime());
  sliderEl.value = String(clamped);
  sliderEl.disabled = false;
  timeLabelEl.textContent = formatTime(new Date(clamped));
  renderShadowsForTime(new Date(clamped));
}

function setupControls() {
  dateEl.setAttribute('aria-label', STRINGS.dateLabel);
  dateEl.min = EARLIEST_DATE;
  dateEl.max = LATEST_DATE;
  dateEl.value = formatDateForInput(todayAtUTCMidnight());
  dateEl.disabled = false;
  applyDate(todayAtUTCMidnight());

  let pending = false;
  sliderEl.addEventListener('input', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      try {
        const t = new Date(Number(sliderEl.value));
        timeLabelEl.textContent = formatTime(t);
        renderShadowsForTime(t);
      } finally {
        pending = false;
      }
    });
  });

  dateEl.addEventListener('change', () => {
    if (!dateEl.value) return;
    // Keep the same time-of-day when hopping to a different date, so
    // browsing dates at a fixed hour ("what does 5pm look like in winter")
    // works without also having to re-drag the slider each time.
    const prevTime = new Date(Number(sliderEl.value));
    const [y, m, d] = dateEl.value.split('-').map(Number);
    const preferred = new Date(y, m - 1, d, prevTime.getHours(), prevTime.getMinutes());
    applyDate(dateInputToUTCMidnight(dateEl.value), preferred.getTime());
  });
}

const RENDER_CHUNK_SIZE = 400;

function renderBuildingsChunked(elements) {
  return new Promise((resolve) => {
    const usable = elements.filter((el) => el.geometry && el.geometry.length >= 3);
    let i = 0;
    function step() {
      const end = Math.min(i + RENDER_CHUNK_SIZE, usable.length);
      for (; i < end; i++) {
        const el = usable[i];
        const footprint = el.geometry.map((pt) => [pt.lat, pt.lon]);
        const heightM = estimateBuildingHeight(el.tags);
        const footprintLayer = L.polygon(footprint, {
          color: '#b96d17',
          weight: 1,
          fillColor: '#f2a63d',
          fillOpacity: 0.25,
          interactive: false,
        }).addTo(map);
        buildings.push({ footprint, heightM, footprintLayer, shadowLayer: null });
      }
      setStatus(STRINGS.rendering(renderProgress(i, usable.length)));
      if (i < usable.length) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    step();
  });
}

async function init() {
  try {
    const elements = await fetchBuildingElements();
    await renderBuildingsChunked(elements);
    setupControls();
    loadingOverlayEl.classList.add('hidden');
  } catch (err) {
    console.error('komarom-shadows: failed to load buildings:', err);
    setStatus(STRINGS.loadError(err.message));
  }
}

init();
