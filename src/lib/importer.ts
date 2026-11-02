import Papa from 'papaparse';
import type { Business, Owner } from './types';
import { normAddress, normName, normPhone, toNumber, uid, nowISO } from './util';

/** A table of raw text cells; row 0 is the header row. */
export type Grid = string[][];

export const TARGETS = [
  { key: 'ignore', label: '— Skip this column —' },
  { key: 'extra', label: 'Keep as extra info' },
  { key: 'name', label: 'Business name' },
  { key: 'full_address', label: 'Full address (street, city, state zip)' },
  { key: 'address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'phone', label: 'Business phone' },
  { key: 'email', label: 'Business email' },
  { key: 'website', label: 'Website' },
  { key: 'hours', label: 'Hours' },
  { key: 'owner_name', label: 'Owner name' },
  { key: 'owner_phone', label: 'Owner phone' },
  { key: 'owner_email', label: 'Owner email' },
  { key: 'owner_mailing', label: 'Owner mailing address' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'sde', label: 'SDE / cash flow' },
  { key: 'asking_price', label: 'Asking price' },
  { key: 'source', label: 'Source' },
  { key: 'notes', label: 'Notes' },
  { key: 'lat', label: 'Latitude' },
  { key: 'lng', label: 'Longitude' },
] as const;
export type TargetKey = (typeof TARGETS)[number]['key'];

const SYNONYMS: [TargetKey, RegExp][] = [
  ['owner_name', /^(owner|owner name|owners?|proprietor|contact|contact name|principal|registered agent)$/],
  ['owner_phone', /^(owner phone|owner cell|contact phone|cell|mobile)$/],
  ['owner_email', /^(owner email|contact email)$/],
  ['owner_mailing', /^(owner (mailing )?address|mailing address|owner address)$/],
  ['name', /^(name|business|business name|company|company name|laundromat|laundromat name|store|store name|dba|title)$/],
  ['full_address', /^(full address|location|address full|formatted address)$/],
  ['address', /^(address|street|street address|address 1|address1|addr)$/],
  ['city', /^(city|town)$/],
  ['state', /^(state|st|province)$/],
  ['zip', /^(zip|zip code|zipcode|postal|postal code|postcode)$/],
  ['phone', /^(phone|phone number|business phone|telephone|tel|number)$/],
  ['email', /^(email|e-mail|business email)$/],
  ['website', /^(website|web|url|site|web site)$/],
  ['hours', /^(hours|business hours|open hours|opening hours)$/],
  ['revenue', /^(revenue|sales|gross|gross revenue|annual revenue)$/],
  ['sde', /^(sde|cash flow|cashflow|ebitda|profit|net income)$/],
  ['asking_price', /^(asking|asking price|price|list price)$/],
  ['source', /^(source|lead source)$/],
  ['notes', /^(notes?|comments?|description|details)$/],
  ['lat', /^(lat|latitude)$/],
  ['lng', /^(lng|lon|long|longitude)$/],
];

export function guessTarget(header: string): TargetKey {
  const h = header.toLowerCase().replace(/[_\-:#*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return 'ignore';
  for (const [key, re] of SYNONYMS) if (re.test(h)) return key;
  if (/address/.test(h)) return 'full_address';
  if (/phone/.test(h)) return 'phone';
  if (/owner/.test(h)) return 'owner_name';
  if (/name/.test(h)) return 'name';
  return 'extra';
}

export function guessMapping(headers: string[]): TargetKey[] {
  const used = new Set<TargetKey>();
  return headers.map((h) => {
    const t = guessTarget(h);
    if (t === 'extra' || t === 'ignore') return t;
    if (used.has(t)) return 'extra'; // only map the first matching column automatically
    used.add(t);
    return t;
  });
}

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/\*\*/g, '') // markdown bold from AI chat output
    .replace(/^\[(.*)\]\(.*\)$/, '$1') // markdown links -> text
    .trim();

function dropEmpty(grid: Grid): Grid {
  return grid.map((r) => r.map(clean)).filter((r) => r.some((c) => c !== ''));
}

/** Parses a markdown table, as ChatGPT / Claude usually produce. */
function parseMarkdownTable(text: string): Grid {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') || (l.includes('|') && l.split('|').length > 2))
    .filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l)) // separator row
    .map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
}

/** Accepts text pasted from Excel/Google Sheets (tabs), CSV, or a markdown table from an AI chat. */
export function parsePastedText(text: string): Grid {
  const t = text.trim();
  if (!t) return [];
  const lines = t.split(/\r?\n/);
  const pipeLines = lines.filter((l) => l.split('|').length > 2).length;
  if (pipeLines >= 2 && pipeLines >= lines.length / 2) return dropEmpty(parseMarkdownTable(t));
  const tabLines = lines.filter((l) => l.includes('\t')).length;
  if (tabLines >= lines.length / 2) return dropEmpty(lines.map((l) => l.split('\t')));
  const res = Papa.parse<string[]>(t, { skipEmptyLines: true });
  return dropEmpty(res.data);
}

export function parseCSV(text: string): Grid {
  return dropEmpty(Papa.parse<string[]>(text, { skipEmptyLines: true }).data);
}

export async function parseExcelFile(file: File): Promise<Grid> {
  const { default: readXlsxFile } = await import('read-excel-file');
  const rows = await readXlsxFile(file);
  return dropEmpty(rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? '' : String(c)))));
}

export async function parseFile(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return parseExcelFile(file);
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. In Excel, use File → Save As → .xlsx or .csv.');
  return parsePastedText(await file.text());
}

/** Turns a Google Sheets link into a CSV download URL. The sheet must be shared "Anyone with the link". */
export function googleSheetCsvUrl(link: string): string | null {
  const m = link.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
}

export async function fetchGoogleSheet(link: string): Promise<Grid> {
  const url = googleSheetCsvUrl(link);
  if (!url) throw new Error("That doesn't look like a Google Sheets link.");
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith('<')) {
    throw new Error('Could not read that sheet. In Google Sheets click Share → General access → "Anyone with the link" (Viewer), then try again. Or use File → Download → CSV and upload the file.');
  }
  return parseCSV(text);
}

/** Splits "123 Main St, Springfield, IL 62704" into parts. Returns null if it can't. */
export function splitAddress(full: string): { address: string; city: string; state: string; zip: string } | null {
  const s = full.replace(/,?\s*(USA|United States( of America)?)\s*$/i, '').trim();
  const m = s.match(/^(.*?),\s*([^,]+?),\s*([A-Za-z]{2})\.?\s*(\d{5}(?:-\d{4})?)?$/);
  if (m) return { address: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] ?? '' };
  const m2 = s.match(/^(.*?),\s*([^,]+?)\s+([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/);
  if (m2) return { address: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: m2[4] };
  return null;
}

export interface ImportRow {
  rowIndex: number;
  business: Business;
  owner: { name: string; phone?: string; email?: string; mailing_address?: string } | null;
  status: 'new' | 'duplicate' | 'ruled_out' | 'invalid';
  matchId?: string;
  matchName?: string;
  reason?: string;
}

function blankBusiness(typeId: string | null): Business {
  const ts = nowISO();
  return {
    id: uid(), type_id: typeId, owner_id: null, name: '', geocode_status: 'pending', stage: 'prospect', priority: 2,
    ruled_out: false, custom: {}, created_at: ts, updated_at: ts,
  };
}

export function rowsToBusinesses(grid: Grid, mapping: TargetKey[], typeId: string | null, source: string): Omit<ImportRow, 'status'>[] {
  const [headers, ...data] = grid;
  return data.map((cells, i) => {
    const b = blankBusiness(typeId);
    b.source = source || null;
    const owner: NonNullable<ImportRow['owner']> = { name: '' };
    const notes: string[] = [];
    mapping.forEach((target, col) => {
      const v = clean(cells[col]);
      if (!v || target === 'ignore') return;
      switch (target) {
        case 'extra': b.custom[headers[col] || `Column ${col + 1}`] = v; break;
        case 'full_address': {
          const parts = splitAddress(v);
          if (parts) Object.assign(b, { address: b.address || parts.address, city: b.city || parts.city, state: b.state || parts.state, zip: b.zip || parts.zip });
          else b.address = b.address || v;
          break;
        }
        case 'owner_name': owner.name = v; break;
        case 'owner_phone': owner.phone = v; break;
        case 'owner_email': owner.email = v; break;
        case 'owner_mailing': owner.mailing_address = v; break;
        case 'revenue': case 'sde': case 'asking_price': b[target] = toNumber(v); break;
        case 'lat': case 'lng': b[target] = toNumber(v); break;
        case 'notes': notes.push(v); break;
        case 'state': b.state = v.length <= 3 ? v.toUpperCase() : v; break;
        default: (b as unknown as Record<string, unknown>)[target] = v;
      }
    });
    if (notes.length) b.notes = notes.join('\n');
    if (b.lat != null && b.lng != null) b.geocode_status = 'ok';
    return { rowIndex: i + 2, business: b, owner: owner.name ? owner : null };
  });
}

function keysFor(b: Pick<Business, 'name' | 'address' | 'city' | 'zip' | 'phone'>): string[] {
  const keys: string[] = [];
  const phone = normPhone(b.phone);
  if (phone.length === 10) keys.push('p:' + phone);
  const addr = normAddress(b.address);
  if (addr && /\d/.test(addr)) keys.push('a:' + addr + '|' + (b.zip?.slice(0, 5) || normName(b.city)));
  const name = normName(b.name);
  if (name && b.city) keys.push('n:' + name + '|' + normName(b.city));
  return keys;
}

/** Flags rows that match an existing business (or an earlier row in the same file). */
export function detectDuplicates(rows: Omit<ImportRow, 'status'>[], existing: Business[]): ImportRow[] {
  const index = new Map<string, Business>();
  for (const b of existing) for (const k of keysFor(b)) if (!index.has(k)) index.set(k, b);
  const seenInFile = new Map<string, number>();
  return rows.map((r) => {
    const b = r.business;
    if (!b.name && !b.address) return { ...r, status: 'invalid', reason: 'No name or address' };
    if (!b.name) b.name = b.address ?? 'Unnamed';
    const keys = keysFor(b);
    for (const k of keys) {
      const m = index.get(k);
      if (m) {
        return m.ruled_out
          ? { ...r, status: 'ruled_out', matchId: m.id, matchName: m.name, reason: `Matches ruled-out "${m.name}"${m.rule_out_reason ? ` (${m.rule_out_reason})` : ''}` }
          : { ...r, status: 'duplicate', matchId: m.id, matchName: m.name, reason: `Already have "${m.name}"` };
      }
    }
    for (const k of keys) {
      const prev = seenInFile.get(k);
      if (prev != null) return { ...r, status: 'duplicate', reason: `Same as row ${prev} in this file` };
    }
    for (const k of keys) seenInFile.set(k, r.rowIndex);
    return { ...r, status: 'new' };
  });
}

/** Finds an existing owner (by phone or name) or creates one. Mutates `owners` to include new ones. */
export function resolveOwner(input: NonNullable<ImportRow['owner']>, owners: Owner[]): { owner: Owner; created: boolean } {
  const phone = normPhone(input.phone);
  const name = input.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const found = owners.find((o) => (phone.length === 10 && normPhone(o.phone) === phone) || o.name.trim().toLowerCase().replace(/\s+/g, ' ') === name);
  if (found) return { owner: found, created: false };
  const ts = nowISO();
  const owner: Owner = {
    id: uid(), name: input.name.trim(), phone: input.phone || null, email: input.email || null,
    mailing_address: input.mailing_address || null, do_not_contact: false, created_at: ts, updated_at: ts,
  };
  owners.push(owner);
  return { owner, created: true };
}
