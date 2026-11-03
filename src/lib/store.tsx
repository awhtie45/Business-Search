import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Backend, TableName } from './backend';
import type { Activity, Business, BusinessType, Owner, SavedRoute, Settings } from './types';
import { nowISO, uid, fullAddress } from './util';
import { geocode } from './geo';
import { isPlaceholderOwnerName } from './importer';

export interface Data {
  types: BusinessType[];
  owners: Owner[];
  businesses: Business[];
  activities: Activity[];
  routes: SavedRoute[];
  settings: Settings;
}

type Toast = { id: number; text: string; kind: 'info' | 'error' };

interface StoreApi extends Data {
  backend: Backend;
  ready: boolean;
  loadError: string | null;
  toasts: Toast[];
  toast(text: string, kind?: Toast['kind']): void;
  geocoding: { remaining: number; running: boolean; lastError: string | null };
  retryGeocoding(ids?: string[]): void;
  saveBusinesses(rows: Business[]): Promise<void>;
  deleteBusinesses(ids: string[]): Promise<void>;
  logActivities(rows: Activity[], opts?: { nextActionDate?: string | null; nextActionNote?: string | null }): Promise<void>;
  deleteActivity(id: string): Promise<void>;
  saveOwners(rows: Owner[]): Promise<void>;
  deleteOwner(id: string): Promise<void>;
  saveType(t: BusinessType): Promise<void>;
  deleteType(id: string): Promise<void>;
  saveRoute(r: SavedRoute): Promise<void>;
  deleteRoute(id: string): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  importBatch(owners: Owner[], businesses: Business[]): Promise<void>;
  reload(): Promise<void>;
}

const Ctx = createContext<StoreApi | null>(null);

export function useStore(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

const DEFAULT_SETTINGS: Settings = { id: '', knock_cooldown_days: 30, ors_api_key: null, default_start: null, default_end: null };

export const LAUNDROMAT_FIELDS: BusinessType['fields'] = [
  { key: 'washers', label: 'Washers', kind: 'number' },
  { key: 'dryers', label: 'Dryers', kind: 'number' },
  { key: 'attended', label: 'Attended', kind: 'yesno' },
  { key: 'wash_fold', label: 'Wash & fold service', kind: 'yesno' },
  { key: 'card_payments', label: 'Card / app payments', kind: 'yesno' },
  { key: 'owns_real_estate', label: 'Owner owns the building', kind: 'yesno' },
  { key: 'lease_years_left', label: 'Lease years remaining', kind: 'number' },
  { key: 'equipment_age', label: 'Equipment age (years)', kind: 'number' },
];

/** "contacted" happens automatically the first time you do any outreach on a prospect. */
function advanceStage(b: Business, kind: Activity['kind']): Business['stage'] {
  return b.stage === 'prospect' && kind !== 'note' ? 'contacted' : b.stage;
}

export function StoreProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [data, setData] = useState<Data>({ types: [], owners: [], businesses: [], activities: [], routes: [], settings: DEFAULT_SETTINGS });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [geocoding, setGeocoding] = useState({ remaining: 0, running: false, lastError: null as string | null });
  const [geoNonce, setGeoNonce] = useState(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 3500);
  }, []);

  const persist = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        toast(`Couldn't save: ${(e as Error).message}`, 'error');
        throw e;
      }
    },
    [toast],
  );

  const loading = useRef<Promise<void> | null>(null);
  const load = useCallback(() => {
    // Collapse overlapping loads (React StrictMode runs effects twice) so first-run seeding happens once.
    loading.current ??= loadOnce().finally(() => { loading.current = null; });
    return loading.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  async function loadOnce() {
    try {
      const [types, owners, businesses, activities, routes, settingsRows] = await Promise.all(
        (['business_types', 'owners', 'businesses', 'activities', 'routes', 'settings'] as TableName[]).map((t) => backend.listAll(t)),
      );
      let settings = (settingsRows[0] as unknown as Settings) ?? null;
      const newTypes = types as unknown as BusinessType[];
      // First run: create the settings row and a Laundromat business type.
      if (!settings) {
        settings = { ...DEFAULT_SETTINGS, id: uid() };
        await backend.upsert('settings', [settings as never]);
      }
      if (newTypes.length === 0) {
        const t: BusinessType = { id: uid(), name: 'Laundromat', fields: LAUNDROMAT_FIELDS, created_at: nowISO() };
        await backend.upsert('business_types', [t as never]);
        newTypes.push(t);
      }
      // Repair: earlier imports could create a fake owner named "Owner"/"Unknown" and link every row to it.
      let ownerList = owners as unknown as Owner[];
      let bizList = (businesses as unknown as Business[]).map((b) => ({ ...b, custom: b.custom ?? {} }));
      const fake = new Set(ownerList.filter((o) => isPlaceholderOwnerName(o.name)).map((o) => o.id));
      if (fake.size) {
        const unlinked = bizList.filter((b) => b.owner_id && fake.has(b.owner_id)).map((b) => ({ ...b, owner_id: null }));
        if (unlinked.length) await backend.upsert('businesses', unlinked as never);
        await backend.remove('owners', [...fake]);
        const byId = new Map(unlinked.map((b) => [b.id, b]));
        bizList = bizList.map((b) => byId.get(b.id) ?? b);
        ownerList = ownerList.filter((o) => !fake.has(o.id));
      }
      setData({
        types: newTypes.sort((a, b) => a.name.localeCompare(b.name)),
        owners: ownerList,
        businesses: bizList,
        activities: activities as unknown as Activity[],
        routes: (routes as unknown as SavedRoute[]).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
        settings,
      });
      setLoadError(null);
      setReady(true);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const api = useMemo<StoreApi>(() => {
    const upsertLocal = <K extends keyof Data>(key: K, rows: { id: string }[]) =>
      setData((d) => {
        const list = d[key] as unknown as { id: string }[];
        const byId = new Map(rows.map((r) => [r.id, r]));
        const merged = list.map((x) => byId.get(x.id) ?? x);
        const existing = new Set(list.map((x) => x.id));
        for (const r of rows) if (!existing.has(r.id)) merged.unshift(r);
        return { ...d, [key]: merged };
      });

    return {
      ...data,
      backend,
      ready,
      loadError,
      toasts,
      toast,
      geocoding,
      reload: load,
      retryGeocoding(ids) {
        if (ids?.length) {
          const want = new Set(ids);
          setData((d) => ({ ...d, businesses: d.businesses.map((b) => (want.has(b.id) ? { ...b, geocode_status: 'pending' } : b)) }));
        }
        setGeocoding((g) => ({ ...g, lastError: null }));
        setGeoNonce((n) => n + 1);
      },

      async saveBusinesses(rows) {
        const ts = nowISO();
        const stamped = rows.map((b) => ({ ...b, updated_at: ts }));
        upsertLocal('businesses', stamped);
        await persist(() => backend.upsert('businesses', stamped as never));
      },

      async deleteBusinesses(ids) {
        const drop = new Set(ids);
        const acts = dataRef.current.activities.filter((a) => drop.has(a.business_id)).map((a) => a.id);
        setData((d) => ({
          ...d,
          businesses: d.businesses.filter((b) => !drop.has(b.id)),
          activities: d.activities.filter((a) => !drop.has(a.business_id)),
          routes: d.routes.map((r) => ({ ...r, stops: r.stops.filter((s) => !drop.has(s.business_id)) })),
        }));
        await persist(async () => {
          if (backend.mode === 'local') await backend.remove('activities', acts);
          await backend.remove('businesses', ids);
        });
      },

      async logActivities(rows, opts) {
        const byBiz = new Map(dataRef.current.businesses.map((b) => [b.id, b]));
        const touched: Business[] = [];
        const ts = nowISO();
        for (const a of rows) {
          const b = byBiz.get(a.business_id);
          if (!b) continue;
          const updated: Business = {
            ...b,
            stage: advanceStage(b, a.kind),
            last_activity_at: !b.last_activity_at || b.last_activity_at < a.occurred_at ? a.occurred_at : b.last_activity_at,
            updated_at: ts,
          };
          if (opts && opts.nextActionDate !== undefined) {
            updated.next_action_date = opts.nextActionDate;
            updated.next_action_note = opts.nextActionNote ?? null;
          }
          byBiz.set(b.id, updated);
          touched.push(updated);
        }
        const unique = [...new Map(touched.map((b) => [b.id, byBiz.get(b.id)!])).values()];
        upsertLocal('activities', rows);
        upsertLocal('businesses', unique);
        await persist(async () => {
          await backend.upsert('activities', rows as never);
          await backend.upsert('businesses', unique as never);
        });
      },

      async deleteActivity(id) {
        setData((d) => ({ ...d, activities: d.activities.filter((a) => a.id !== id) }));
        await persist(() => backend.remove('activities', [id]));
      },

      async saveOwners(rows) {
        const ts = nowISO();
        const stamped = rows.map((o) => ({ ...o, updated_at: ts }));
        upsertLocal('owners', stamped);
        await persist(() => backend.upsert('owners', stamped as never));
      },

      async deleteOwner(id) {
        const linked = dataRef.current.businesses.filter((b) => b.owner_id === id).map((b) => ({ ...b, owner_id: null }));
        setData((d) => ({ ...d, owners: d.owners.filter((o) => o.id !== id) }));
        upsertLocal('businesses', linked);
        await persist(async () => {
          if (linked.length) await backend.upsert('businesses', linked as never);
          await backend.remove('owners', [id]);
        });
      },

      async saveType(t) {
        upsertLocal('types', [t]);
        await persist(() => backend.upsert('business_types', [t as never]));
      },

      async deleteType(id) {
        const linked = dataRef.current.businesses.filter((b) => b.type_id === id).map((b) => ({ ...b, type_id: null }));
        setData((d) => ({ ...d, types: d.types.filter((t) => t.id !== id) }));
        upsertLocal('businesses', linked);
        await persist(async () => {
          if (linked.length) await backend.upsert('businesses', linked as never);
          await backend.remove('business_types', [id]);
        });
      },

      async saveRoute(r) {
        upsertLocal('routes', [r]);
        await persist(() => backend.upsert('routes', [r as never]));
      },

      async deleteRoute(id) {
        setData((d) => ({ ...d, routes: d.routes.filter((r) => r.id !== id) }));
        await persist(() => backend.remove('routes', [id]));
      },

      async saveSettings(s) {
        setData((d) => ({ ...d, settings: s }));
        await persist(() => backend.upsert('settings', [s as never]));
      },

      async importBatch(owners, businesses) {
        upsertLocal('owners', owners);
        upsertLocal('businesses', businesses);
        await persist(async () => {
          if (owners.length) await backend.upsert('owners', owners as never);
          await backend.upsert('businesses', businesses as never);
        });
      },
    };
  }, [data, backend, ready, loadError, toasts, toast, geocoding, load, persist]);

  // Background geocoder: finds map locations for businesses that have an address but no coordinates.
  const geoRunning = useRef(false);
  const pendingCount = data.businesses.filter((b) => b.geocode_status === 'pending' && fullAddress(b)).length;
  useEffect(() => {
    setGeocoding((g) => ({ ...g, remaining: pendingCount }));
    if (!ready || geoRunning.current || pendingCount === 0) return;
    geoRunning.current = true;
    setGeocoding((g) => ({ ...g, running: true, lastError: null }));
    (async () => {
      try {
        for (;;) {
          const d = dataRef.current;
          const next = d.businesses.find((b) => b.geocode_status === 'pending' && fullAddress(b));
          if (!next) break;
          let patch: Partial<Business>;
          try {
            const r = await geocode(fullAddress(next), d.settings.ors_api_key);
            patch = r ? { lat: r.lat, lng: r.lng, geocode_status: 'ok' } : { geocode_status: 'failed' };
          } catch (e) {
            setGeocoding((g) => ({ ...g, lastError: (e as Error).message }));
            break; // stop on key / quota / network problems; retried on next change or reload
          }
          const latest = dataRef.current.businesses.find((b) => b.id === next.id);
          if (!latest) continue;
          const updated = { ...latest, ...patch, updated_at: nowISO() };
          setData((cur) => ({ ...cur, businesses: cur.businesses.map((b) => (b.id === updated.id ? updated : b)) }));
          dataRef.current = { ...dataRef.current, businesses: dataRef.current.businesses.map((b) => (b.id === updated.id ? updated : b)) };
          await backend.upsert('businesses', [updated as never]).catch(() => undefined);
          if (d.settings.ors_api_key) await new Promise((r) => setTimeout(r, 700)); // stay under 100/min
        }
      } finally {
        geoRunning.current = false;
        setGeocoding((g) => ({ ...g, running: false }));
      }
    })();
  }, [ready, pendingCount, backend, geoNonce, data.settings.ors_api_key]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Convenience lookups used across pages. */
export function useLookups() {
  const { types, owners, activities } = useStore();
  return useMemo(() => {
    const typeById = new Map(types.map((t) => [t.id, t]));
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    const activitiesByBiz = new Map<string, Activity[]>();
    for (const a of activities) {
      const list = activitiesByBiz.get(a.business_id) ?? [];
      list.push(a);
      activitiesByBiz.set(a.business_id, list);
    }
    for (const list of activitiesByBiz.values()) list.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return { typeById, ownerById, activitiesByBiz };
  }, [types, owners, activities]);
}
