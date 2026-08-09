// komarom-shadows-logic.js
// Pure functions only — no DOM, no fetch, no localStorage. Testable in
// isolation with `node --test`. Imported directly by komarom-shadows.html
// as an ES module and by test/komarom-shadows-logic.test.js.
//
// Sun position uses a standard low-precision solar-position algorithm
// (Meeus/NOAA-style geocentric formulas), accurate to roughly 0.01 degree
// for 1950-2050 — independently verified during design against known
// solstice/equinox altitude, azimuth, and day-length facts.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const METERS_PER_DEG_LAT = 111320;

function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

function daysSinceJ2000(date) {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
}

function sunEquatorialPosition(n) {
  const L = norm360(280.460 + 0.9856474 * n) * DEG;
  const g = norm360(357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * DEG) * Math.sin(g) + (0.020 * DEG) * Math.sin(2 * g);
  const epsilon = (23.439 - 0.0000004 * n) * DEG;

  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  return { ra, dec };
}

function gmstDegrees(n) {
  return norm360(280.46061837 + 360.98564736629 * n);
}

export function sunPosition(date, latDeg, lonDeg) {
  const n = daysSinceJ2000(date);
  const { ra, dec } = sunEquatorialPosition(n);
  const gmst = gmstDegrees(n);
  const lst = norm360(gmst + lonDeg) * DEG;
  let H = lst - ra;
  H = Math.atan2(Math.sin(H), Math.cos(H)); // normalize to -PI..PI

  const lat = latDeg * DEG;
  const altitude = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  );
  const azimuthFromSouth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)
  );
  const azimuth = norm360(azimuthFromSouth * RAD + 180);

  return { altitude: altitude * RAD, azimuth };
}

export function sunriseSunset(dateAtMidnightUTC, latDeg, lonDeg) {
  const stepMin = 5;
  const samples = [];
  for (let m = 0; m <= 24 * 60; m += stepMin) {
    const t = new Date(dateAtMidnightUTC.getTime() + m * 60000);
    samples.push({ t, altitude: sunPosition(t, latDeg, lonDeg).altitude });
  }

  function refine(tLo, tHi) {
    let lo = tLo;
    let hi = tHi;
    for (let i = 0; i < 20; i++) {
      const mid = new Date((lo.getTime() + hi.getTime()) / 2);
      const altLo = sunPosition(lo, latDeg, lonDeg).altitude;
      const altMid = sunPosition(mid, latDeg, lonDeg).altitude;
      if ((altLo < 0) === (altMid < 0)) lo = mid; else hi = mid;
    }
    return new Date((lo.getTime() + hi.getTime()) / 2);
  }

  let sunrise = null;
  let sunset = null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev.altitude < 0 && cur.altitude >= 0 && !sunrise) sunrise = refine(prev.t, cur.t);
    if (prev.altitude >= 0 && cur.altitude < 0 && !sunset) sunset = refine(prev.t, cur.t);
  }
  return { sunrise, sunset };
}

export function offsetPoint(lat, lon, distanceM, bearingDeg) {
  const latRad = lat * DEG;
  const dLat = (distanceM * Math.cos(bearingDeg * DEG)) / METERS_PER_DEG_LAT;
  const dLon = (distanceM * Math.sin(bearingDeg * DEG)) / (METERS_PER_DEG_LAT * Math.cos(latRad));
  return [lat + dLat, lon + dLon];
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function buildingShadowPolygon(footprint, heightM, sunAltitudeDeg, sunAzimuthDeg) {
  if (sunAltitudeDeg <= 0) return null;
  const shadowLenM = heightM / Math.tan(sunAltitudeDeg * DEG);
  const shadowBearing = norm360(sunAzimuthDeg + 180);
  const offset = footprint.map(([lat, lon]) => offsetPoint(lat, lon, shadowLenM, shadowBearing));
  return convexHull(footprint.concat(offset));
}

export function estimateBuildingHeight(tags) {
  if (tags && tags.height) {
    const h = parseFloat(tags.height);
    if (Number.isFinite(h) && h > 0) return h;
  }
  if (tags && tags['building:levels']) {
    const levels = parseFloat(tags['building:levels']);
    if (Number.isFinite(levels) && levels > 0) return levels * 3;
  }
  return 6;
}

export function isCacheStale(fetchedAt, now, maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  return now - fetchedAt > maxAgeMs;
}
