import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

export type TableName = 'business_types' | 'owners' | 'businesses' | 'activities' | 'routes' | 'settings';
export const TABLES: TableName[] = ['business_types', 'owners', 'businesses', 'activities', 'routes', 'settings'];

type Row = { id: string } & Record<string, unknown>;

/** Everything the app needs from storage. The app keeps all data in memory, so this is plain CRUD. */
export interface Backend {
  mode: 'supabase' | 'local';
  listAll(table: TableName): Promise<Row[]>;
  upsert(table: TableName, rows: Row[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function supabaseBackend(client: SupabaseClient): Backend {
  return {
    mode: 'supabase',
    async listAll(table) {
      const all: Row[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await client.from(table).select('*').range(from, from + page - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        all.push(...((data ?? []) as Row[]));
        if (!data || data.length < page) break;
      }
      return all;
    },
    async upsert(table, rows) {
      for (const part of chunks(rows, 500)) {
        const { error } = await client.from(table).upsert(part);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    },
    async remove(table, ids) {
      for (const part of chunks(ids, 200)) {
        const { error } = await client.from(table).delete().in('id', part);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    },
  };
}

const LS_PREFIX = 'bizsearch:';

export function localBackend(storage: Storage = window.localStorage): Backend {
  const read = (t: TableName): Row[] => {
    try {
      return JSON.parse(storage.getItem(LS_PREFIX + t) ?? '[]');
    } catch {
      return [];
    }
  };
  const write = (t: TableName, rows: Row[]) => storage.setItem(LS_PREFIX + t, JSON.stringify(rows));
  return {
    mode: 'local',
    async listAll(table) {
      return read(table);
    },
    async upsert(table, rows) {
      const existing = new Map(read(table).map((r) => [r.id, r]));
      for (const r of rows) existing.set(r.id, { ...existing.get(r.id), ...r });
      write(table, [...existing.values()]);
    },
    async remove(table, ids) {
      const drop = new Set(ids);
      write(table, read(table).filter((r) => !drop.has(r.id)));
    },
  };
}

export type { Session };
