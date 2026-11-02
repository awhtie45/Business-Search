export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in meters. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GeocodeResult extends LatLng {
  label: string;
}

const ORS = 'https://api.openrouteservice.org';

async function geocodeORS(text: string, key: string): Promise<GeocodeResult | null> {
  const u = `${ORS}/geocode/search?api_key=${encodeURIComponent(key)}&size=1&boundary.country=US&text=${encodeURIComponent(text)}`;
  const res = await fetch(u);
  if (res.status === 401 || res.status === 403) throw new Error('OpenRouteService rejected the API key. Check it in Settings.');
  if (res.status === 429) throw new Error('OpenRouteService daily limit reached. Try again tomorrow.');
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const f = data.features?.[0];
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat, lng, label: f.properties?.label ?? text };
}

let lastNominatim = 0;
async function geocodeNominatim(text: string): Promise<GeocodeResult | null> {
  // Nominatim's free service allows at most 1 request per second.
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(text)}`;
  const res = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const f = data?.[0];
  if (!f) return null;
  return { lat: parseFloat(f.lat), lng: parseFloat(f.lon), label: f.display_name ?? text };
}

/** Accepts "lat, lng" typed directly, otherwise looks the address up. */
export function parseLatLng(text: string): LatLng | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export async function geocode(text: string, orsKey?: string | null): Promise<GeocodeResult | null> {
  const direct = parseLatLng(text);
  if (direct) return { ...direct, label: text };
  if (!text.trim()) return null;
  return orsKey ? geocodeORS(text, orsKey) : geocodeNominatim(text);
}

/** Decodes a Google-style encoded polyline (precision 5) into [lat, lng] pairs. */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

export interface OptimizeJob extends LatLng {
  id: number;
  priority?: number; // 0-100, higher is more important
}

export interface OptimizeResult {
  order: number[]; // job ids in visiting order
  distance_m: number | null;
  duration_s: number | null;
  geometry: [number, number][] | null;
}

/** Calls OpenRouteService's route optimizer (VROOM). It picks up to `maxStops` jobs and orders them. */
export async function orsOptimize(key: string, start: LatLng, end: LatLng, jobs: OptimizeJob[], maxStops: number, serviceSeconds: number): Promise<OptimizeResult> {
  const body = {
    jobs: jobs.map((j) => ({ id: j.id, location: [j.lng, j.lat], service: serviceSeconds, priority: j.priority ?? 0 })),
    vehicles: [{ id: 1, profile: 'driving-car', start: [start.lng, start.lat], end: [end.lng, end.lat], max_tasks: maxStops }],
    options: { g: true },
  };
  const res = await fetch(`${ORS}/optimization`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new Error('OpenRouteService rejected the API key. Check it in Settings.');
  if (res.status === 429) throw new Error('OpenRouteService daily limit reached.');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Route optimization failed (${res.status}) ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return { order: [], distance_m: null, duration_s: null, geometry: null };
  return {
    order: route.steps.filter((s: { type: string }) => s.type === 'job').map((s: { job?: number; id?: number }) => s.job ?? s.id),
    distance_m: route.distance ?? null,
    duration_s: route.duration ?? null,
    geometry: route.geometry ? decodePolyline(route.geometry) : null,
  };
}
