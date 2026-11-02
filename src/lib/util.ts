export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old browsers / non-secure contexts.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowISO = () => new Date().toISOString();

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Plain dates (YYYY-MM-DD) are shown as-is in local time, not shifted by timezone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function fmtMiles(meters: number | null | undefined): string {
  if (meters == null) return '';
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function digitsOnly(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Normalizes a US phone number to its last 10 digits for comparison. */
export function normPhone(s: string | null | undefined): string {
  const d = digitsOnly(s);
  return d.length >= 10 ? d.slice(-10) : d;
}

const STREET_ABBREV: Record<string, string> = {
  street: 'st', avenue: 'ave', av: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', lane: 'ln',
  court: 'ct', place: 'pl', parkway: 'pkwy', highway: 'hwy', suite: 'ste', north: 'n', south: 's',
  east: 'e', west: 'w', circle: 'cir', terrace: 'ter', square: 'sq', trail: 'trl',
};

/** Normalizes a street address for duplicate matching ("123 Main Street, Suite 4" -> "123 main st ste 4"). */
export function normAddress(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_ABBREV[w] ?? w)
    .join(' ');
}

export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(llc|inc|co|corp|the|laundromat|laundry|coin)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fullAddress(b: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }): string {
  const cityState = [b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [b.address, cityState].filter(Boolean).join(', ');
}

export function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().toLowerCase().replace(/[$,\s]/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'k' ? n * 1e3 : m[2] === 'm' ? n * 1e6 : n;
}

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
