import { useState } from 'react';
import { STAGES, type Business, type Owner } from '../lib/types';
import { useStore } from '../lib/store';
import { fullAddress, nowISO, toNumber, uid } from '../lib/util';
import { splitAddress } from '../lib/importer';
import { parseLatLng } from '../lib/geo';
import { Field } from './ui';

export function newBusiness(typeId: string | null): Business {
  const ts = nowISO();
  return { id: uid(), type_id: typeId, owner_id: null, name: '', geocode_status: 'pending', stage: 'prospect', priority: 2, ruled_out: false, custom: {}, created_at: ts, updated_at: ts };
}

type OwnerMode = 'none' | 'existing' | 'new';

export function BusinessForm({ initial, onSaved, onCancel }: { initial: Business; onSaved: (b: Business) => void; onCancel?: () => void }) {
  const { types, owners, saveBusinesses, saveOwners, businesses } = useStore();
  const [b, setB] = useState<Business>(initial);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>(initial.owner_id ? 'existing' : 'none');
  const [newOwner, setNewOwner] = useState({ name: '', phone: '', email: '', mailing_address: '' });
  const [coords, setCoords] = useState(initial.lat != null && initial.lng != null ? `${initial.lat}, ${initial.lng}` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const type = types.find((t) => t.id === b.type_id);
  const set = <K extends keyof Business>(k: K, v: Business[K]) => setB((x) => ({ ...x, [k]: v }));
  const setCustom = (k: string, v: string | number | boolean | null) => setB((x) => ({ ...x, custom: { ...x.custom, [k]: v } }));

  const possibleDupes = !initial.created_at || initial.name === ''
    ? businesses.filter((o) => o.id !== b.id && b.name.trim().length > 3 && o.name.toLowerCase().includes(b.name.trim().toLowerCase())).slice(0, 3)
    : [];

  function onAddressPaste(v: string) {
    const parts = splitAddress(v);
    if (parts) setB((x) => ({ ...x, ...parts }));
    else set('address', v);
  }

  async function save() {
    if (!b.name.trim()) return setError('Business name is required.');
    setBusy(true);
    try {
      let out: Business = { ...b, name: b.name.trim() };
      if (ownerMode === 'new' && newOwner.name.trim()) {
        const ts = nowISO();
        const o: Owner = { id: uid(), name: newOwner.name.trim(), phone: newOwner.phone || null, email: newOwner.email || null, mailing_address: newOwner.mailing_address || null, do_not_contact: false, created_at: ts, updated_at: ts };
        await saveOwners([o]);
        out.owner_id = o.id;
      } else if (ownerMode === 'none') out.owner_id = null;
      const manual = parseLatLng(coords);
      const addrChanged = fullAddress(out) !== fullAddress(initial);
      if (manual && (manual.lat !== initial.lat || manual.lng !== initial.lng)) out = { ...out, ...manual, geocode_status: 'manual' };
      else if (!coords.trim() && (initial.lat != null)) out = { ...out, lat: null, lng: null, geocode_status: 'pending' };
      else if (addrChanged && out.geocode_status !== 'manual') out = { ...out, lat: null, lng: null, geocode_status: 'pending' };
      await saveBusinesses([out]);
      onSaved(out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}
      <div className="grid form">
        <Field label="Business name *" className="span-all">
          <input value={b.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Sunshine Coin Laundry" />
        </Field>
        {possibleDupes.length > 0 && (
          <div className="alert warn span-all">Possible duplicate: {possibleDupes.map((d) => `${d.name}${d.city ? ` (${d.city})` : ''}`).join(', ')}</div>
        )}
        <Field label="Business type">
          <select value={b.type_id ?? ''} onChange={(e) => set('type_id', e.target.value || null)}>
            <option value="">No type</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Stage">
          <select value={b.stage} onChange={(e) => set('stage', e.target.value as Business['stage'])}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={b.priority} onChange={(e) => set('priority', Number(e.target.value) as Business['priority'])}>
            <option value={1}>High</option>
            <option value={2}>Normal</option>
            <option value={3}>Low</option>
          </select>
        </Field>
        <Field label="Street address (or paste the full address)" className="span-all">
          <input value={b.address ?? ''} onChange={(e) => onAddressPaste(e.target.value)} placeholder="123 Main St, Springfield, IL 62704" />
        </Field>
        <Field label="City"><input value={b.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><input value={b.state ?? ''} onChange={(e) => set('state', e.target.value.toUpperCase())} maxLength={20} /></Field>
        <Field label="ZIP"><input value={b.zip ?? ''} onChange={(e) => set('zip', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Phone"><input value={b.phone ?? ''} onChange={(e) => set('phone', e.target.value)} type="tel" /></Field>
        <Field label="Email"><input value={b.email ?? ''} onChange={(e) => set('email', e.target.value)} type="email" /></Field>
        <Field label="Website"><input value={b.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Hours"><input value={b.hours ?? ''} onChange={(e) => set('hours', e.target.value)} placeholder="e.g. 6am–10pm daily; owner there mornings" /></Field>
        <Field label="Source"><input value={b.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder="Google, ChatGPT list, drive-by…" /></Field>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <h3>Owner</h3>
        <div className="chips" style={{ marginBottom: 10 }}>
          {(['none', 'existing', 'new'] as OwnerMode[]).map((m) => (
            <button key={m} type="button" className={`chip ${ownerMode === m ? 'on' : ''}`} onClick={() => setOwnerMode(m)}>
              {m === 'none' ? 'Unknown' : m === 'existing' ? 'Pick existing' : 'New owner'}
            </button>
          ))}
        </div>
        {ownerMode === 'existing' && (
          <select value={b.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)}>
            <option value="">— choose —</option>
            {[...owners].sort((x, y) => x.name.localeCompare(y.name)).map((o) => <option key={o.id} value={o.id}>{o.name}{o.phone ? ` · ${o.phone}` : ''}</option>)}
          </select>
        )}
        {ownerMode === 'new' && (
          <div className="grid form">
            <Field label="Owner name"><input value={newOwner.name} onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })} /></Field>
            <Field label="Phone"><input value={newOwner.phone} onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })} type="tel" /></Field>
            <Field label="Email"><input value={newOwner.email} onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })} type="email" /></Field>
            <Field label="Mailing address"><input value={newOwner.mailing_address} onChange={(e) => setNewOwner({ ...newOwner, mailing_address: e.target.value })} /></Field>
          </div>
        )}
      </div>

      {type && type.fields.length > 0 && (
        <div className="card" style={{ marginBottom: 0 }}>
          <h3>{type.name} details</h3>
          <div className="grid form">
            {type.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.kind === 'yesno' ? (
                  <select value={b.custom[f.key] == null ? '' : b.custom[f.key] ? 'yes' : 'no'} onChange={(e) => setCustom(f.key, e.target.value === '' ? null : e.target.value === 'yes')}>
                    <option value="">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : (
                  <input value={(b.custom[f.key] as string | number | null) ?? ''} inputMode={f.kind === 'number' ? 'decimal' : undefined}
                    onChange={(e) => setCustom(f.key, f.kind === 'number' ? toNumber(e.target.value) ?? (e.target.value || null) : e.target.value || null)} />
                )}
              </Field>
            ))}
          </div>
        </div>
      )}

      <details className="card" style={{ marginBottom: 0 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Deal numbers, notes & map location</summary>
        <div className="grid form" style={{ marginTop: 10 }}>
          <Field label="Revenue ($/yr)"><input value={b.revenue ?? ''} onChange={(e) => set('revenue', toNumber(e.target.value))} inputMode="decimal" /></Field>
          <Field label="SDE / cash flow ($/yr)"><input value={b.sde ?? ''} onChange={(e) => set('sde', toNumber(e.target.value))} inputMode="decimal" /></Field>
          <Field label="Asking price ($)"><input value={b.asking_price ?? ''} onChange={(e) => set('asking_price', toNumber(e.target.value))} inputMode="decimal" /></Field>
          <Field label="Map location (lat, lng) — leave blank to look up from address">
            <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="41.8781, -87.6298" />
          </Field>
          <Field label="Notes" className="span-all"><textarea value={b.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      </details>

      <div className="row sticky-actions">
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
