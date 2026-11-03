import type { Activity, Business, Owner } from './types';
import { haversine, orsOptimize, type LatLng } from './geo';
import { daysSince } from './util';

/** Road distance is usually ~1.3x straight-line; used for estimates when no routing service is available. */
const ROAD_FACTOR = 1.3;
const AVG_SPEED_MPS = 13; // ~30 mph in town
export const MAX_ORS_JOBS = 48;

export interface EligibilityOptions {
  typeIds: string[]; // empty = all types
  stages: string[]; // empty = all stages
  cooldownDays: number; // skip if knocked within this many days
  includeContacted: boolean; // false = only businesses never contacted at all
  playbookSteps?: string[]; // only businesses at these playbook steps
}

export interface EligibilityContext {
  lastKnock: Map<string, string>;
  ownersById: Map<string, Owner>;
}

export function buildContext(activities: Activity[], owners: Owner[]): EligibilityContext {
  const lastKnock = new Map<string, string>();
  for (const a of activities) {
    if (a.kind !== 'door_knock') continue;
    const prev = lastKnock.get(a.business_id);
    if (!prev || prev < a.occurred_at) lastKnock.set(a.business_id, a.occurred_at);
  }
  return { lastKnock, ownersById: new Map(owners.map((o) => [o.id, o])) };
}

/** Returns null if the business can be put on a door-knock route, otherwise the reason it can't. */
export function ineligibleReason(b: Business, opts: EligibilityOptions, ctx: EligibilityContext): string | null {
  if (b.ruled_out) return 'Ruled out';
  if (b.lat == null || b.lng == null) return 'No map location';
  if (b.owner_id && ctx.ownersById.get(b.owner_id)?.do_not_contact) return 'Owner marked do-not-contact';
  if (b.stage === 'closed') return 'Closed deal';
  if (opts.typeIds.length && !opts.typeIds.includes(b.type_id ?? '')) return 'Different business type';
  if (opts.stages.length && !opts.stages.includes(b.stage)) return 'Different stage';
  if (opts.playbookSteps?.length && !opts.playbookSteps.includes(b.playbook_step ?? '')) return 'Different playbook step';
  if (!opts.includeContacted && b.last_activity_at) return 'Already contacted';
  const since = daysSince(ctx.lastKnock.get(b.id));
  if (since != null && since < opts.cooldownDays) return `Knocked ${since} day${since === 1 ? '' : 's'} ago`;
  return null;
}

const priorityWeight = (p: number) => (p === 1 ? 0.6 : p === 3 ? 1.5 : 1);

/** Extra distance needed to visit `p` on the way from start to end, weighted by priority. */
export function detour(start: LatLng, end: LatLng, p: LatLng, priority = 2): number {
  return (haversine(start, p) + haversine(p, end) - haversine(start, end)) * priorityWeight(priority);
}

/** Narrows the pool to the stops most "on the way". */
export function pickCandidates<T extends LatLng & { priority?: number }>(pool: T[], start: LatLng, end: LatLng, limit: number): T[] {
  return [...pool].sort((a, b) => detour(start, end, a, a.priority) - detour(start, end, b, b.priority)).slice(0, limit);
}

function pathLength(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/**
 * Offline route builder: cheapest-insertion to choose `n` stops between fixed start/end,
 * then 2-opt to untangle the order. Works without any API key.
 */
export function localRoute<T extends LatLng & { priority?: number }>(start: LatLng, end: LatLng, pool: T[], n: number): { stops: T[]; distance_m: number; duration_s: number } {
  const remaining = [...pool];
  const route: LatLng[] = [start, end];
  const chosen: T[] = [];
  while (chosen.length < n && remaining.length) {
    let best = { cost: Infinity, idx: -1, pos: -1 };
    remaining.forEach((p, idx) => {
      const w = priorityWeight(p.priority ?? 2);
      for (let pos = 1; pos < route.length; pos++) {
        const cost = (haversine(route[pos - 1], p) + haversine(p, route[pos]) - haversine(route[pos - 1], route[pos])) * w;
        if (cost < best.cost) best = { cost, idx, pos };
      }
    });
    const [p] = remaining.splice(best.idx, 1);
    route.splice(best.pos, 0, p);
    chosen.push(p);
  }
  // 2-opt with fixed endpoints.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const before = haversine(route[i - 1], route[i]) + haversine(route[k], route[k + 1]);
        const after = haversine(route[i - 1], route[k]) + haversine(route[i], route[k + 1]);
        if (after + 1e-6 < before) {
          const mid = route.slice(i, k + 1).reverse();
          route.splice(i, mid.length, ...mid);
          improved = true;
        }
      }
    }
  }
  const stops = route.slice(1, -1) as T[];
  const distance_m = pathLength(route) * ROAD_FACTOR;
  return { stops, distance_m, duration_s: distance_m / AVG_SPEED_MPS };
}

export interface PlannedRoute {
  stops: Business[];
  distance_m: number | null;
  duration_s: number | null; // driving time only
  geometry: [number, number][] | null;
  method: 'openrouteservice' | 'estimate';
  warning?: string;
}

type Located = Business & { lat: number; lng: number };

export async function planRoute(opts: { start: LatLng; end: LatLng; pool: Business[]; stops: number; orsKey?: string | null; minutesPerStop: number }): Promise<PlannedRoute> {
  const located = opts.pool.filter((b): b is Located => b.lat != null && b.lng != null);
  const n = Math.min(opts.stops, located.length);
  if (n === 0) return { stops: [], distance_m: null, duration_s: null, geometry: null, method: 'estimate' };

  if (opts.orsKey) {
    const candidates = pickCandidates(located, opts.start, opts.end, MAX_ORS_JOBS);
    try {
      const res = await orsOptimize(
        opts.orsKey, opts.start, opts.end,
        candidates.map((b, i) => ({ id: i + 1, lat: b.lat, lng: b.lng, priority: b.priority === 1 ? 100 : b.priority === 2 ? 50 : 0 })),
        n, opts.minutesPerStop * 60,
      );
      if (res.order.length) {
        const durationDriving = res.duration_s != null ? Math.max(0, res.duration_s - res.order.length * opts.minutesPerStop * 60) : null;
        return { stops: res.order.map((id) => candidates[id - 1]), distance_m: res.distance_m, duration_s: durationDriving, geometry: res.geometry, method: 'openrouteservice' };
      }
    } catch (e) {
      const local = localRoute(opts.start, opts.end, pickCandidates(located, opts.start, opts.end, Math.max(n * 4, 60)), n);
      return { ...local, geometry: null, method: 'estimate', warning: `${(e as Error).message} Showing an estimated route instead.` };
    }
  }
  const local = localRoute(opts.start, opts.end, pickCandidates(located, opts.start, opts.end, Math.max(n * 4, 60)), n);
  return { ...local, geometry: null, method: 'estimate' };
}

const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/**
 * Google Maps directions links. Google allows ~9 waypoints per link, so long routes are split into legs.
 */
export function googleMapsLegs(start: LatLng, end: LatLng, stops: LatLng[], perLeg = 9): string[] {
  const points = [start, ...stops, end];
  const links: string[] = [];
  let i = 0;
  while (i < points.length - 1) {
    const last = Math.min(i + perLeg + 1, points.length - 1);
    const origin = points[i];
    const dest = points[last];
    const way = points.slice(i + 1, last);
    const params = new URLSearchParams({ api: '1', origin: ll(origin), destination: ll(dest), travelmode: 'driving' });
    if (way.length) params.set('waypoints', way.map(ll).join('|'));
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    i = last;
  }
  return links;
}

export function googleMapsTo(p: LatLng, label?: string): string {
  const params = new URLSearchParams({ api: '1', destination: label ? label : ll(p), travelmode: 'driving' });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
