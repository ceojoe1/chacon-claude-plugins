// Geocoding + great-circle distance via OpenStreetMap Nominatim.
// Free, keyless, ~1 req/s rate-limited per their usage policy.
// https://operations.osmfoundation.org/policies/nominatim/

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'chacon-travel-vacai (https://github.com/ceojoe1/chacon-claude-plugins)';
const cache = new Map();
let lastReqMs = 0;

async function rateLimit() {
  const wait = Math.max(0, 1100 - (Date.now() - lastReqMs));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastReqMs = Date.now();
}

export async function geocode(query) {
  if (!query) return null;
  const key = query.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);
  await rateLimit();
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      cache.set(key, null);
      return null;
    }
    const coord = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache.set(key, coord);
    return coord;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function haversineMiles(a, b) {
  if (!a || !b) return null;
  const R = 3958.8; // earth radius, miles
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
