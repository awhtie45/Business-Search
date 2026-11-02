import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Owner } from '../lib/types';
import { Empty, Field, Modal, StageBadge } from '../components/ui';
import { nowISO, uid } from '../lib/util';

export function Owners() {
  const { owners, businesses, saveOwners, deleteOwner, toast } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Owner | null>(null);

  useEffect(() => {
    const f = params.get('focus');
    const o = f && owners.find((x) => x.id === f);
    if (o) setEditing(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const needle = q.toLowerCase();
  const list = owners
    .filter((o) => !needle || [o.name, o.phone, o.email, o.mailing_address].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const bizByOwner = new Map<string, typeof businesses>();
  for (const b of businesses) if (b.owner_id) bizByOwner.set(b.owner_id, [...(bizByOwner.get(b.owner_id) ?? []), b]);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Owners <span className="muted small">({owners.length})</span></h1>
        <button className="btn primary" onClick={() => setEditing({ id: uid(), name: '', do_not_contact: false, created_at: nowISO() })}>+ Add owner</button>
      </div>
      <p className="muted small">One owner can have several businesses. Linking them means one conversation covers all their locations, and you won't mail the same person three times.</p>
      <div className="card"><input placeholder="Search owners…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card tight">
        {list.length === 0 ? <Empty>No owners yet. Add one from a business page, or import a list with an owner column.</Empty> : list.map((o) => {
          const biz = bizByOwner.get(o.id) ?? [];
          return (
            <div key={o.id} className="list-item">
              <div className="row between">
                <div>
                  <strong>{o.name}</strong> {o.do_not_contact && <span className="badge danger">Do not contact</span>}
                  <div className="small muted">{[o.phone, o.email, o.mailing_address].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn sm" onClick={() => setEditing(o)}>Edit</button>
              </div>
              {biz.length > 0 && (
                <div className="small" style={{ marginTop: 6 }}>
                  {biz.map((b) => <div key={b.id}><Link to={`/businesses/${b.id}`}>{b.name}</Link> <span className="muted">{b.city}</span> <StageBadge b={b} /></div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <OwnerModal owner={editing} onClose={() => setEditing(null)}
          onSave={async (o) => { await saveOwners([o]); setEditing(null); toast('Owner saved'); }}
          onDelete={owners.some((x) => x.id === editing.id) ? async () => { if (confirm('Delete this owner? Their businesses are kept.')) { await deleteOwner(editing.id); setEditing(null); } } : undefined} />
      )}
    </div>
  );
}

function OwnerModal({ owner, onClose, onSave, onDelete }: { owner: Owner; onClose: () => void; onSave: (o: Owner) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [o, setO] = useState(owner);
  return (
    <Modal title={owner.name ? 'Edit owner' : 'New owner'} onClose={onClose}>
      <div className="stack">
        <Field label="Name *"><input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} autoFocus /></Field>
        <div className="grid form">
          <Field label="Phone"><input type="tel" value={o.phone ?? ''} onChange={(e) => setO({ ...o, phone: e.target.value })} /></Field>
          <Field label="Email"><input type="email" value={o.email ?? ''} onChange={(e) => setO({ ...o, email: e.target.value })} /></Field>
        </div>
        <Field label="Mailing address (used for postcards & letters instead of the business address)">
          <input value={o.mailing_address ?? ''} onChange={(e) => setO({ ...o, mailing_address: e.target.value })} placeholder="123 Home Rd, Springfield, IL 62704" />
        </Field>
        <Field label="Notes"><textarea value={o.notes ?? ''} onChange={(e) => setO({ ...o, notes: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={o.do_not_contact} onChange={(e) => setO({ ...o, do_not_contact: e.target.checked })} /> Do not contact (excluded from routes and mailing exports)</label>
        <div className="row">
          <button className="btn primary" disabled={!o.name.trim()} onClick={() => onSave({ ...o, name: o.name.trim() })}>Save</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </Modal>
  );
}
