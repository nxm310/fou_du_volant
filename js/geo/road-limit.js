import { state } from '../core/state.js';
import { haversineMeters } from './spatial-index.js';

const REQUEST_INTERVAL = 6000;
const MAX_DISTANCE = 65;
const RESULT_LIFETIME = 20000;
const MAX_ACCURACY = 20;
let lastRequest = -Infinity;
let pending;
let sample;
let expiry;

function angleDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

export function readRoadLimit(data, position) {
  const edges = data?.[0]?.edges;
  if (!Array.isArray(edges)) return null;

  // Keep nearby candidates with a compatible direction. Close alternatives
  // with different or missing limits make the assignment ambiguous.
  const candidates = edges.filter(edge =>
    Number.isFinite(edge.distance) && edge.distance >= 0 && edge.distance <= 20
    && Number.isFinite(edge.heading) && angleDifference(position.heading, edge.heading) <= 35
  ).sort((a, b) => a.distance - b.distance);

  const nearest = candidates[0];
  if (!nearest || nearest.distance > 12 || nearest.edge?.classification?.link) return null;
  const limit = nearest.edge_info?.speed_limit;
  if (!Number.isInteger(limit) || limit <= 0 || limit > 130) return null;
  const ambiguous = candidates.some(edge => edge.distance <= nearest.distance + position.accuracy
    && (edge.edge_info?.speed_limit !== limit || Object.keys(edge.edge_info?.conditional_speed_limits ?? {}).length));
  return ambiguous ? null : limit;
}

function positionIsUsable(pos) {
  return pos && Number.isFinite(pos.heading) && pos.accuracy > 0 && pos.accuracy <= MAX_ACCURACY;
}

function stillNear(origin, current) {
  return positionIsUsable(current) && angleDifference(origin.heading, current.heading) <= 30
    && haversineMeters(origin.lat, origin.lng, current.lat, current.lng) <= MAX_DISTANCE;
}

export function clearRoadLimit() {
  pending?.abort();
  pending = null;
  sample = null;
  clearTimeout(expiry);
  state.setRoadSpeedLimit(null);
}

export async function refreshRoadLimit(position) {
  if (!state.runtime.isCarMode || !positionIsUsable(position) || document.hidden) {
    clearRoadLimit();
    return;
  }
  if (sample && !stillNear(sample, position)) {
    sample = null;
    state.setRoadSpeedLimit(null);
  }
  const now = Date.now();
  if (pending || now - lastRequest < REQUEST_INTERVAL) return;
  // A stationary vehicle can reuse the last result until it expires.
  if (sample && position.speed < 5 && stillNear(sample, position)) return;

  lastRequest = now;
  const controller = new AbortController();
  pending = controller;
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL('https://valhalla1.openstreetmap.de/locate');
    url.searchParams.set('json', JSON.stringify({
      verbose: true,
      costing: 'auto',
      locations: [{ lat: position.lat, lon: position.lng, heading: position.heading, radius: 20 }]
    }));
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'X-Client-Id': 'nxm310.github.io/fou_du_volant' }
    });
    if (!response.ok) throw new Error(`Route lookup: HTTP ${response.status}`);
    const limit = readRoadLimit(await response.json(), position);
    if (pending !== controller) return;
    const current = state.runtime.userPos;
    if (!state.runtime.gpsActive || !stillNear(position, current) || limit === null) {
      clearRoadLimit();
      return;
    }
    sample = position;
    state.setRoadSpeedLimit(limit);
    clearTimeout(expiry);
    expiry = setTimeout(() => {
      sample = null;
      state.setRoadSpeedLimit(null);
    }, RESULT_LIFETIME);
  } catch {
    if (pending === controller) clearRoadLimit();
  } finally {
    clearTimeout(timeout);
    if (pending === controller) pending = null;
  }
}
