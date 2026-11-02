import { useState } from 'react';
import { useStore } from '../lib/store';
import type { BusinessType, CustomFieldDef } from '../lib/types';
import { downloadText, nowISO, todayISO, uid } from '../lib/util';
import { supabase } from '../lib/backend';
import { Field, Modal } from '../components/ui';

export function SettingsPage() {
  const store = useStore();
  const { settings, saveSettings, types, saveType, deleteType, businesses, toast, backend, geocoding, retryGeocoding } = store;
  const [key, setKey] = useState(settings.ors_api_key ?? '');
  const [cooldown, setCooldown] = useState(settings.knock_cooldown_days);
  const [editing, setEditing] = useState<BusinessType | null>(null);
  const failed = businesses.filter((b) => b.geocode_status === 'failed');

  function backup() {
    const { types: t, owners, businesses: b, activities, routes } = store;
    downloadText(`business-search-backup-${todayISO()}.json`, JSON.stringify({ version: 1, exported_at: nowISO(), types: t, owners, businesses: b, activities, routes }, null, 2), 'application/json');
  }

  async function restore(file: File) {
    const data = JSON.parse(await file.text());
    if (data.version !== 1) throw new Error('Not a Business Search backup file.');
    if (!confirm(`Restore ${data.businesses?.length ?? 0} businesses from this backup? Records with the same ID will be overwritten; nothing is deleted.`)) return;
    const strip = (rows: Record<string, unknown>[]) => rows.map(({ user_id: _u, ...r }) => r);
    await backend.upsert('business_types', strip(data.types ?? []) as never);
    await backend.upsert('owners', strip(data.owners ?? []) as never);
    await backend.upsert('businesses', strip(data.businesses ?? []) as never);
    await backend.upsert('activities', strip(data.activities ?? []) as never);
    await backend.upsert('routes', strip(data.routes ?? []) as never);
    await store.reload();
    toast('Backup restored');
  }

  return (
    <div>
      <h1>Settings</h1>

      <div className="card stack">
        <h2>Maps & routing</h2>
        <p className="small muted">
          A free <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noreferrer">OpenRouteService</a> key gives you real driving routes and better address lookups (free plan: about 2,000 address lookups and 500 route optimizations per day, no credit card).
          Without a key the app still works: addresses are looked up with OpenStreetMap's free service (slower, one per second), and routes use straight-line estimates.
        </p>
        <Field label="OpenRouteService API key">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste key here" autoComplete="off" />
        </Field>
        <Field label="Default: skip businesses I knocked on in the last … days">
          <input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <div className="row">
          <button className="btn primary" onClick={async () => { await saveSettings({ ...settings, ors_api_key: key.trim() || null, knock_cooldown_days: cooldown }); toast('Settings saved'); }}>Save</button>
        </div>
        <div className="small muted">
          Map lookups: {geocoding.running ? `working… ${geocoding.remaining} left` : geocoding.remaining ? `${geocoding.remaining} waiting` : 'all done'}
          {geocoding.lastError && <span style={{ color: 'var(--danger)' }}> — {geocoding.lastError}</span>}
          {failed.length > 0 && <> · {failed.length} addresses couldn't be found <button className="btn sm" onClick={() => retryGeocoding(failed.map((b) => b.id))}>Retry them</button></>}
          {geocoding.lastError && <> <button className="btn sm" onClick={() => retryGeocoding()}>Retry</button></>}
        </div>
      </div>

      <div className="card stack">
        <div className="row between"><h2 style={{ margin: 0 }}>Business types</h2><button className="btn sm" onClick={() => setEditing({ id: uid(), name: '', fields: [], created_at: nowISO() })}>+ Add type</button></div>
        <p className="small muted">Each type can have its own extra fields (for laundromats: washers, dryers, lease…).</p>
        {types.map((t) => (
          <div key={t.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <div><strong>{t.name}</strong> <span className="small muted">{businesses.filter((b) => b.type_id === t.id).length} businesses · {t.fields.length} extra fields</span></div>
            <button className="btn sm" onClick={() => setEditing(t)}>Edit</button>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>Backup</h2>
        <p className="small muted">Download everything as one file. Good to do now and then, and before big imports.</p>
        <div className="row">
          <button className="btn" onClick={backup}>Download backup</button>
          <label className="btn">Restore from backup<input type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f).catch((err) => toast(err.message, 'error')); }} /></label>
        </div>
      </div>

      <div className="card stack">
        <h2>Account</h2>
        {backend.mode === 'local' ? (
          <p className="small">Local mode: data lives in this browser only. To use the app on both your phone and laptop, connect Supabase (see README → Setup).</p>
        ) : (
          <button className="btn" onClick={() => supabase?.auth.signOut()}>Sign out</button>
        )}
      </div>

      {editing && (
        <TypeModal type={editing} onClose={() => setEditing(null)} onSave={async (t) => { await saveType(t); setEditing(null); toast('Saved'); }}
          onDelete={types.some((x) => x.id === editing.id) ? async () => { if (confirm(`Delete "${editing.name}"? Businesses of this type are kept but lose their type.`)) { await deleteType(editing.id); setEditing(null); } } : undefined} />
      )}
    </div>
  );
}

function TypeModal({ type, onClose, onSave, onDelete }: { type: BusinessType; onClose: () => void; onSave: (t: BusinessType) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [t, setT] = useState(type);
  const setField = (i: number, patch: Partial<CustomFieldDef>) => setT({ ...t, fields: t.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <Modal title={type.name ? `Edit ${type.name}` : 'New business type'} onClose={onClose}>
      <div className="stack">
        <Field label="Name"><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="e.g. Car wash" /></Field>
        <h3>Extra fields</h3>
        {t.fields.map((f, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Field name" />
            <select value={f.kind} onChange={(e) => setField(i, { kind: e.target.value as CustomFieldDef['kind'] })} style={{ width: 110 }}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="yesno">Yes/No</option>
            </select>
            <button className="btn sm" onClick={() => setT({ ...t, fields: t.fields.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn sm" onClick={() => setT({ ...t, fields: [...t.fields, { key: '', label: '', kind: 'text' }] })}>+ Add field</button>
        <div className="row">
          <button className="btn primary" disabled={!t.name.trim()} onClick={() => onSave({
            ...t, name: t.name.trim(),
            fields: t.fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim(), key: f.key || f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') })),
          })}>Save</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>Delete type</button>}
        </div>
      </div>
    </Modal>
  );
}
