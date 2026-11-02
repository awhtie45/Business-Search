import { describe, expect, it } from 'vitest';
import { detectDuplicates, googleSheetCsvUrl, guessMapping, parsePastedText, resolveOwner, rowsToBusinesses, splitAddress } from './importer';
import { decodePolyline, haversine, parseLatLng } from './geo';
import { buildContext, googleMapsLegs, ineligibleReason, localRoute } from './routing';
import { normAddress, normPhone, toNumber } from './util';
import type { Business, Owner } from './types';

const biz = (p: Partial<Business>): Business => ({
  id: Math.random().toString(36).slice(2), type_id: 't', owner_id: null, name: 'X', geocode_status: 'ok', stage: 'prospect',
  priority: 2, ruled_out: false, custom: {}, ...p,
});

describe('parsing pasted tables', () => {
  it('reads markdown tables from AI chats', () => {
    const g = parsePastedText(`Here you go:\n\n| Name | Address | Phone |\n|---|:---:|---|\n| **Suds City** | 12 Main St, Springfield, IL 62704 | (217) 555-0101 |\n| Wash World | 9 Oak Ave, Springfield, IL | 217-555-0102 |\n\nLet me know!`);
    expect(g).toEqual([
      ['Name', 'Address', 'Phone'],
      ['Suds City', '12 Main St, Springfield, IL 62704', '(217) 555-0101'],
      ['Wash World', '9 Oak Ave, Springfield, IL', '217-555-0102'],
    ]);
  });
  it('reads tab-separated rows pasted from a spreadsheet', () => {
    expect(parsePastedText('Name\tCity\nA\tB\n')).toEqual([['Name', 'City'], ['A', 'B']]);
  });
  it('reads CSV with quotes', () => {
    expect(parsePastedText('Name,Address\n"Suds, Inc","1 A St, X, IL 60000"')).toEqual([['Name', 'Address'], ['Suds, Inc', '1 A St, X, IL 60000']]);
  });
});

describe('column mapping', () => {
  it('guesses common headings', () => {
    expect(guessMapping(['Business Name', 'Address', 'City', 'State', 'Zip Code', 'Phone Number', 'Owner', 'Rating'])).toEqual(
      ['name', 'address', 'city', 'state', 'zip', 'phone', 'owner_name', 'extra']);
  });
  it('treats a lone address column as a full address', () => {
    expect(guessMapping(['Name', 'Full Address'])).toEqual(['name', 'full_address']);
  });
});

describe('address splitting', () => {
  it('splits full US addresses', () => {
    expect(splitAddress('123 Main St, Springfield, IL 62704')).toEqual({ address: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' });
    expect(splitAddress('123 Main St, Suite 4, Springfield, il 62704, USA')).toEqual({ address: '123 Main St, Suite 4', city: 'Springfield', state: 'IL', zip: '62704' });
    expect(splitAddress('9 Oak Ave, Springfield, IL')).toEqual({ address: '9 Oak Ave', city: 'Springfield', state: 'IL', zip: '' });
    expect(splitAddress('just some text')).toBeNull();
  });
});

describe('duplicate detection', () => {
  const existing = [
    biz({ id: 'a', name: 'Suds City Laundromat', address: '12 Main Street', city: 'Springfield', zip: '62704', phone: '217-555-0101' }),
    biz({ id: 'b', name: 'Old Wash', address: '50 Elm St', city: 'Springfield', zip: '62704', ruled_out: true, rule_out_reason: 'Too small' }),
  ];
  it('flags matches by phone, address, and ruled-out records', () => {
    const grid = [
      ['Name', 'Address', 'Phone'],
      ['Suds City', '99 Other Rd, Springfield, IL 62704', '(217) 555-0101'], // same phone
      ['Old Wash LLC', '50 Elm Street, Springfield, IL 62704', ''], // ruled out, same address
      ['Brand New', '1 New St, Springfield, IL 62704', ''],
      ['Brand New', '1 New St., Springfield, IL 62704', ''], // dup within file
      ['', '', '555'], // invalid
    ];
    const rows = detectDuplicates(rowsToBusinesses(grid, ['name', 'full_address', 'phone'], 't', 'test'), existing);
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'ruled_out', 'new', 'duplicate', 'invalid']);
    expect(rows[1].reason).toContain('Too small');
  });
  it('keeps unmapped columns as extra info and parses money', () => {
    const [r] = rowsToBusinesses([['Name', 'Rating', 'Asking'], ['A', '4.5', '$350k']], ['name', 'extra', 'asking_price'], null, '');
    expect(r.business.custom).toEqual({ Rating: '4.5' });
    expect(r.business.asking_price).toBe(350000);
  });
});

describe('owners', () => {
  it('reuses an owner with the same name or phone', () => {
    const pool: Owner[] = [{ id: 'o1', name: 'Jane Doe', phone: '217 555 0000', do_not_contact: false }];
    expect(resolveOwner({ name: 'jane  doe' }, pool).owner.id).toBe('o1');
    expect(resolveOwner({ name: 'J. Doe', phone: '(217) 555-0000' }, pool).owner.id).toBe('o1');
    const r = resolveOwner({ name: 'Bob' }, pool);
    expect(r.created).toBe(true);
    expect(pool).toHaveLength(2);
  });
});

describe('utils', () => {
  it('normalizes', () => {
    expect(normPhone('+1 (217) 555-0101')).toBe('2175550101');
    expect(normAddress('12 Main Street, Suite #4')).toBe('12 main st ste 4');
    expect(toNumber('$1.2m')).toBe(1200000);
    expect(toNumber('abc')).toBeNull();
    expect(parseLatLng('41.88, -87.63')).toEqual({ lat: 41.88, lng: -87.63 });
    expect(googleSheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=42')).toBe('https://docs.google.com/spreadsheets/d/abc_123/gviz/tq?tqx=out:csv&gid=42');
  });
  it('decodes polylines', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});

describe('routing', () => {
  const start = { lat: 40, lng: -88 };
  const end = { lat: 40, lng: -87.9 };
  // Points along the way plus far-away outliers.
  const pool = [
    { id: 'p3', lat: 40.001, lng: -87.93 },
    { id: 'p1', lat: 40.001, lng: -87.99 },
    { id: 'far', lat: 41, lng: -88 },
    { id: 'p2', lat: 40.002, lng: -87.96 },
    { id: 'far2', lat: 39, lng: -87 },
  ];
  it('chooses on-the-way stops and orders them sensibly', () => {
    const r = localRoute(start, end, pool, 3);
    expect(r.stops.map((s) => s.id)).toEqual(['p1', 'p2', 'p3']);
    expect(r.distance_m).toBeGreaterThan(haversine(start, end));
  });
  it('never returns more stops than requested or available', () => {
    expect(localRoute(start, end, pool, 2).stops).toHaveLength(2);
    expect(localRoute(start, end, pool, 99).stops).toHaveLength(5);
  });
  it('splits long routes into Google Maps links of <= 9 waypoints', () => {
    const stops = Array.from({ length: 20 }, (_, i) => ({ lat: 40 + i / 1000, lng: -88 }));
    const legs = googleMapsLegs(start, end, stops);
    expect(legs).toHaveLength(3);
    const counts = legs.map((u) => (new URL(u).searchParams.get('waypoints') ?? '').split('|').filter(Boolean).length);
    expect(counts.every((c) => c <= 9)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0) + legs.length - 1).toBe(20); // shared leg endpoints are stops too
  });
  it('applies eligibility rules', () => {
    const recent = new Date(Date.now() - 3 * 86400000).toISOString();
    const ctx = buildContext([{ id: 'x', business_id: 'k', kind: 'door_knock', occurred_at: recent }], [{ id: 'dnc', name: 'N', do_not_contact: true }]);
    const opts = { typeIds: [], stages: [], cooldownDays: 30, includeContacted: true };
    expect(ineligibleReason(biz({ lat: 1, lng: 1 }), opts, ctx)).toBeNull();
    expect(ineligibleReason(biz({ lat: 1, lng: 1, ruled_out: true }), opts, ctx)).toBe('Ruled out');
    expect(ineligibleReason(biz({}), opts, ctx)).toBe('No map location');
    expect(ineligibleReason(biz({ id: 'k', lat: 1, lng: 1 }), opts, ctx)).toBe('Knocked 3 days ago');
    expect(ineligibleReason(biz({ lat: 1, lng: 1, owner_id: 'dnc' }), opts, ctx)).toMatch(/do-not-contact/);
    expect(ineligibleReason(biz({ lat: 1, lng: 1, last_activity_at: recent }), { ...opts, includeContacted: false }, ctx)).toBe('Already contacted');
  });
});
