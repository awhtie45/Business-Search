import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import { STAGES, kindInfo, type ActivityKind, type Business } from '../lib/types';
import { fmtDate, fmtDateTime, fmtMoney, fullAddress, todayISO } from '../lib/util';
import { googleMapsTo } from '../lib/routing';
import { Empty, FollowUpBadge, Field, Modal, PriorityBadge, StageBadge } from '../components/ui';
import { ActivityLogger } from '../components/ActivityLogger';
import { BusinessForm, newBusiness } from '../components/BusinessForm';
import { MapView } from '../components/MapView';
import { RuleOutModal } from './Businesses';
import { PlaybookPanel } from '../components/PlaybookPanel';

export function NewBusiness() {
  const { types } = useStore();
  const navigate = useNavigate();
  const [initial] = useState(() => newBusiness(types[0]?.id ?? null));
  return (
    <div className="card">
      <h1>Add a business</h1>
      <BusinessForm initial={initial} onSaved={(b) => navigate(`/businesses/${b.id}`, { replace: true })} onCancel={() => navigate(-1)} />
    </div>
  );
}

export function BusinessDetail() {
  const { id } = useParams();
  const { businesses, saveBusinesses, deleteBusinesses, deleteActivity, saveOwners, retryGeocoding, toast } = useStore();
  const { typeById, ownerById, activitiesByBiz } = useLookups();
  const navigate = useNavigate();
  const [modal, setModal] = useState<null | 'edit' | 'ruleout' | 'followup' | 'delete' | { log: ActivityKind }>(null);
  const b = businesses.find((x) => x.id === id);
  if (!b) return <div className="card"><Empty>Business not found. <Link to="/businesses">Back to list</Link></Empty></div>;

  const type = typeById.get(b.type_id ?? '');
  const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
  const acts = activitiesByBiz.get(b.id) ?? [];
  const siblings = owner ? businesses.filter((x) => x.owner_id === owner.id && x.id !== b.id) : [];
  const addr = fullAddress(b);
  const update = (patch: Partial<Business>) => saveBusinesses([{ ...b, ...patch }]);
  const customEntries = Object.entries(b.custom ?? {}).filter(([, v]) => v !== null && v !== '');
  const fieldLabel = (k: string) => type?.fields.find((f) => f.key === k)?.label ?? k;
  const showVal = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : String(v));
  const phone = owner?.phone || b.phone;

  return (
    <div>
      <div className="row between top" style={{ marginBottom: 8 }}>
        <div className="grow">
          <div className="small"><Link to="/businesses">← Businesses</Link></div>
          <h1 style={{ marginBottom: 4 }}>{b.name}</h1>
          <div className="row" style={{ gap: 6 }}>
            <StageBadge b={b} /> <PriorityBadge p={b.priority} />
            {type && <span className="badge soft">{type.name}</span>}
            {owner?.do_not_contact && <span className="badge danger">Do not contact</span>}
          </div>
        </div>
        <button className="btn" onClick={() => setModal('edit')}>Edit</button>
      </div>

      {b.ruled_out && (
        <div className="alert warn row between">
          <span>Ruled out: <strong>{b.rule_out_reason}</strong>{b.rule_out_note ? ` — ${b.rule_out_note}` : ''}{b.revisit_date ? ` · revisit ${fmtDate(b.revisit_date)}` : ''}</span>
          <button className="btn sm" onClick={async () => { await update({ ruled_out: false, rule_out_reason: null, rule_out_note: null, revisit_date: null }); toast('Back in play'); }}>Reinstate</button>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ gap: 8 }}>
          {phone && <a className="btn primary" href={`tel:${phone}`} onClick={() => setTimeout(() => setModal({ log: 'call' }), 400)}>📞 Call {owner?.phone ? 'owner' : ''}</a>}
          <button className="btn" onClick={() => setModal({ log: 'call' })}>Log call</button>
          <button className="btn" onClick={() => setModal({ log: 'door_knock' })}>🚪 Log knock</button>
          <button className="btn" onClick={() => setModal({ log: 'postcard' })}>📮 Postcard</button>
          <button className="btn" onClick={() => setModal({ log: 'letter' })}>✉️ Letter</button>
          <button className="btn" onClick={() => setModal({ log: 'note' })}>📝 Note</button>
          {addr && <a className="btn" href={googleMapsTo({ lat: b.lat ?? 0, lng: b.lng ?? 0 }, addr)} target="_blank" rel="noreferrer">🧭 Directions</a>}
          {!b.ruled_out && <button className="btn danger" onClick={() => setModal('ruleout')}>Rule out</button>}
        </div>
      </div>

      <PlaybookPanel key={b.id} b={b} />

      <div className="grid two">
        <div>
          <div className="card">
            <div className="row between"><h2>Next follow-up</h2><button className="btn sm" onClick={() => setModal('followup')}>Change</button></div>
            {b.next_action_date ? (
              <p><strong>{fmtDate(b.next_action_date)}</strong> <FollowUpBadge date={b.next_action_date} />{b.next_action_note && <><br /><span className="muted">{b.next_action_note}</span></>}</p>
            ) : <p className="muted">None scheduled.</p>}
            <Field label="Stage">
              <select value={b.stage} onChange={(e) => update({ stage: e.target.value as Business['stage'] })}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="card">
            <h2>Details</h2>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px' }}>
              {addr && <><dt className="muted">Address</dt><dd style={{ margin: 0 }}>{addr}</dd></>}
              {b.phone && <><dt className="muted">Phone</dt><dd style={{ margin: 0 }}><a href={`tel:${b.phone}`}>{b.phone}</a></dd></>}
              {b.email && <><dt className="muted">Email</dt><dd style={{ margin: 0 }}><a href={`mailto:${b.email}`}>{b.email}</a></dd></>}
              {b.website && <><dt className="muted">Website</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}><a href={/^https?:/.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer">{b.website}</a></dd></>}
              {b.hours && <><dt className="muted">Hours</dt><dd style={{ margin: 0 }}>{b.hours}</dd></>}
              {b.best_time && <><dt className="muted">Best time</dt><dd style={{ margin: 0 }}>{b.best_time}</dd></>}
              {b.source && <><dt className="muted">Source</dt><dd style={{ margin: 0 }}>{b.source}</dd></>}
              {b.revenue != null && <><dt className="muted">Revenue</dt><dd style={{ margin: 0 }}>{fmtMoney(b.revenue)}</dd></>}
              {b.sde != null && <><dt className="muted">SDE</dt><dd style={{ margin: 0 }}>{fmtMoney(b.sde)}</dd></>}
              {b.asking_price != null && <><dt className="muted">Asking</dt><dd style={{ margin: 0 }}>{fmtMoney(b.asking_price)}{b.sde ? ` (${(b.asking_price / b.sde).toFixed(1)}× SDE)` : ''}</dd></>}
              {customEntries.map(([k, v]) => <FragmentRow key={k} label={fieldLabel(k)} value={showVal(v)} />)}
            </dl>
            {b.notes && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{b.notes}</p>}
          </div>

          <div className="card">
            <h2>Owner</h2>
            {owner ? (
              <>
                <p><strong>{owner.name}</strong></p>
                {owner.phone && <p><a href={`tel:${owner.phone}`}>{owner.phone}</a></p>}
                {owner.email && <p><a href={`mailto:${owner.email}`}>{owner.email}</a></p>}
                {owner.mailing_address && <p className="muted">{owner.mailing_address}</p>}
                <label className="check"><input type="checkbox" checked={owner.do_not_contact} onChange={(e) => saveOwners([{ ...owner, do_not_contact: e.target.checked }])} /> Do not contact</label>
                {siblings.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small muted">Also owns:</div>
                    {siblings.map((s) => <div key={s.id}><Link to={`/businesses/${s.id}`}>{s.name}</Link> <span className="small muted">{s.city}</span></div>)}
                  </div>
                )}
                <div style={{ marginTop: 8 }}><Link className="small" to={`/owners?focus=${owner.id}`}>Edit owner →</Link></div>
              </>
            ) : <p className="muted">Unknown. Click Edit to add the owner.</p>}
          </div>

          <div className="card">
            <div className="row between">
              <h2>Map</h2>
              <span className="small muted">
                {b.geocode_status === 'pending' && addr ? 'Looking up location…' : b.geocode_status === 'failed' ? <>Couldn't find this address. <button className="btn sm" onClick={() => retryGeocoding([b.id])}>Retry</button></> : ''}
              </span>
            </div>
            {b.lat != null ? <MapView businesses={[b]} className="map short" /> : <p className="muted small">No map location yet. {!addr && 'Add an address.'} You can also enter coordinates under Edit → Deal numbers, notes & map location.</p>}
          </div>
        </div>

        <div className="card">
          <div className="row between"><h2>Activity ({acts.length})</h2><button className="btn sm primary" onClick={() => setModal({ log: 'call' })}>+ Log</button></div>
          {acts.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul className="timeline">
              {acts.map((a) => (
                <li key={a.id}>
                  <span className="ico">{kindInfo(a.kind).icon}</span>
                  <div className="grow">
                    <div className="row between">
                      <strong>{kindInfo(a.kind).label}{a.outcome ? ` — ${a.outcome}` : ''}</strong>
                      <button className="btn sm" title="Delete" onClick={() => { if (confirm('Delete this activity?')) deleteActivity(a.id); }}>✕</button>
                    </div>
                    <div className="small muted">{fmtDateTime(a.occurred_at)}{a.campaign ? ` · ${a.campaign}` : ''}</div>
                    {a.notes && <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn sm danger" onClick={() => setModal('delete')}>Delete business</button>
          </div>
        </div>
      </div>

      {modal === 'edit' && (
        <Modal title="Edit business" onClose={() => setModal(null)}>
          <BusinessForm initial={b} onSaved={() => { setModal(null); toast('Saved'); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal && typeof modal === 'object' && (
        <Modal title={`Log activity — ${b.name}`} onClose={() => setModal(null)}>
          <ActivityLogger businessIds={[b.id]} defaultKind={modal.log} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'ruleout' && (
        <RuleOutModal count={1} onClose={() => setModal(null)} onSave={async (reason, note, revisit) => {
          await update({ ruled_out: true, rule_out_reason: reason, rule_out_note: note || null, revisit_date: revisit || null, next_action_date: null, next_action_note: null });
          setModal(null);
          toast('Ruled out');
        }} />
      )}
      {modal === 'followup' && <FollowUpModal b={b} onClose={() => setModal(null)} onSave={async (d, n) => { await update({ next_action_date: d || null, next_action_note: n || null }); setModal(null); }} />}
      {modal === 'delete' && (
        <Modal title="Delete business?" onClose={() => setModal(null)}>
          <p>This permanently deletes <strong>{b.name}</strong> and its {acts.length} activities. If you just want it off your list, use <strong>Rule out</strong> — that keeps it from being re-imported later.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn danger" onClick={async () => { await deleteBusinesses([b.id]); navigate('/businesses', { replace: true }); toast('Deleted'); }}>Delete permanently</button>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </>
  );
}

function FollowUpModal({ b, onClose, onSave }: { b: Business; onClose: () => void; onSave: (date: string, note: string) => Promise<void> }) {
  const [date, setDate] = useState(b.next_action_date ?? todayISO());
  const [note, setNote] = useState(b.next_action_note ?? '');
  return (
    <Modal title="Next follow-up" onClose={onClose}>
      <div className="stack">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="What to do"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Call back — owner in on Tuesdays" /></Field>
        <div className="row">
          <button className="btn primary" onClick={() => onSave(date, note)}>Save</button>
          <button className="btn" onClick={() => onSave('', '')}>Clear follow-up</button>
        </div>
      </div>
    </Modal>
  );
}
