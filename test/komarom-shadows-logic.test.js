import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sunPosition,
  sunriseSunset,
  offsetPoint,
  convexHull,
  buildingShadowPolygon,
  estimateBuildingHeight,
  isCacheStale,
} from '../komarom-shadows-logic.js';

const LAT = 47.7574;
const LON = 18.1298;

test('sunPosition at true solar noon on the summer solstice matches known altitude/azimuth', () => {
  // Verified during design: peak altitude for this date/location occurs at
  // 2026-06-21T10:49:12Z, altitude 65.68deg, azimuth ~180deg (due south).
  const p = sunPosition(new Date('2026-06-21T10:49:12.000Z'), LAT, LON);
  assert.ok(Math.abs(p.altitude - 65.68) < 0.05, `altitude was ${p.altitude}`);
  assert.ok(Math.abs(p.azimuth - 179.95) < 0.05, `azimuth was ${p.azimuth}`);
});

test('sunPosition at winter solstice solar noon has low altitude, still roughly south', () => {
  const p = sunPosition(new Date('2026-12-21T11:00:00.000Z'), LAT, LON);
  assert.ok(Math.abs(p.altitude - 18.73) < 0.1, `altitude was ${p.altitude}`);
  assert.ok(p.azimuth > 170 && p.azimuth < 195, `azimuth was ${p.azimuth}`);
});

test('sunPosition sunrise on the spring equinox is near due east, altitude near 0', () => {
  const p = sunPosition(new Date('2026-03-20T04:56:00.000Z'), LAT, LON);
  assert.ok(Math.abs(p.altitude) < 0.5, `altitude was ${p.altitude}`);
  assert.ok(Math.abs(p.azimuth - 90.29) < 0.5, `azimuth was ${p.azimuth}`);
});

test('sunriseSunset gives a ~15h48m day on the summer solstice', () => {
  const { sunrise, sunset } = sunriseSunset(new Date(Date.UTC(2026, 5, 21)), LAT, LON);
  const hours = (sunset.getTime() - sunrise.getTime()) / 3600000;
  assert.ok(Math.abs(hours - 15.8) < 0.2, `day length was ${hours}h`);
  assert.equal(sunrise.toISOString().slice(0, 10), '2026-06-21');
});

test('sunriseSunset gives a ~12h day on the spring equinox', () => {
  const { sunrise, sunset } = sunriseSunset(new Date(Date.UTC(2026, 2, 20)), LAT, LON);
  const hours = (sunset.getTime() - sunrise.getTime()) / 3600000;
  assert.ok(Math.abs(hours - 12) < 0.2, `day length was ${hours}h`);
});

test('offsetPoint 1000m north moves latitude by ~1000/111320 degrees', () => {
  const [lat] = offsetPoint(47.75, 18.13, 1000, 0);
  assert.ok(Math.abs((lat - 47.75) - 1000 / 111320) < 1e-6);
});

test('offsetPoint 1000m east moves longitude accounting for latitude compression', () => {
  const [, lon] = offsetPoint(47.75, 18.13, 1000, 90);
  const expected = 1000 / (111320 * Math.cos(47.75 * Math.PI / 180));
  assert.ok(Math.abs((lon - 18.13) - expected) < 1e-6);
});

test('convexHull of a simple square returns all 4 corners', () => {
  const square = [[0, 0], [0, 1], [1, 1], [1, 0]];
  assert.equal(convexHull(square).length, 4);
});

test('convexHull drops a point strictly inside the hull', () => {
  const points = [[0, 0], [0, 2], [2, 2], [2, 0], [1, 1]];
  const hull = convexHull(points);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some(([x, y]) => x === 1 && y === 1));
});

test('buildingShadowPolygon at 45deg altitude casts a shadow of length equal to height', () => {
  const square = [[47.750, 18.130], [47.7501, 18.130], [47.7501, 18.1301], [47.750, 18.1301]];
  // Sun due south (azimuth 180) at 45deg altitude -> shadow points north, length = height.
  const shadow = buildingShadowPolygon(square, 10, 45, 180);
  const footprintMaxLat = Math.max(...square.map((p) => p[0]));
  const shadowMaxLat = Math.max(...shadow.map((p) => p[0]));
  const shadowLengthM = (shadowMaxLat - footprintMaxLat) * 111320;
  assert.ok(Math.abs(shadowLengthM - 10) < 0.5, `shadow length was ${shadowLengthM}m`);
});

test('buildingShadowPolygon returns null when the sun is below the horizon', () => {
  const square = [[47.750, 18.130], [47.7501, 18.130], [47.7501, 18.1301], [47.750, 18.1301]];
  assert.equal(buildingShadowPolygon(square, 10, -5, 180), null);
});

test('estimateBuildingHeight prefers the height tag', () => {
  assert.equal(estimateBuildingHeight({ height: '12' }), 12);
});

test('estimateBuildingHeight falls back to building:levels times 3', () => {
  assert.equal(estimateBuildingHeight({ 'building:levels': '4' }), 12);
});

test('estimateBuildingHeight defaults to 6 when no tags are present', () => {
  assert.equal(estimateBuildingHeight({}), 6);
  assert.equal(estimateBuildingHeight(undefined), 6);
});

test('isCacheStale is false within 30 days, true past it', () => {
  const fetchedAt = 1000;
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  assert.equal(isCacheStale(fetchedAt, fetchedAt + maxAgeMs, maxAgeMs), false);
  assert.equal(isCacheStale(fetchedAt, fetchedAt + maxAgeMs + 1, maxAgeMs), true);
});
