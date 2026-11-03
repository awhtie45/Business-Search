import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import { STAGES, kindInfo, type Activity, type ActivityKind, type Business } from '../lib/types';
import { fmtDate, fmtDateTime, fmtMoney, fullAddress, todayISO } from '../lib/util';
import { googleMapsTo } from '../lib/routing';
import { STEP_INFO } from '../lib/playbook';
import { Empty, FollowUpBadge, Field, Menu, Modal, PriorityBadge, StageBadge } from '../components/ui';
import { ActivityLogger } from '../components/ActivityLogger';
import { BusinessForm, newBusiness } from '../components/BusinessForm';
import { MapView } from '../components/MapView';
import { PlaybookTab, StepBadge } from '../components/PlaybookPanel';
import { RuleOutModal } from './Businesses';

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

type Tab = 'activities' | 'playbook' | 'map';
type ModalState = null | 'edit' | 'ruleout' | 'followup' | 'delete' | { log: ActivityKind };

const FILTERS: { key: string; label: string; kinds: ActivityKind[] | null }[] = [
  { key: 'all', label: 'All activities', kinds: null },
  { key: 'calls', label: 'Calls', kinds: ['call'] },
  { key: 'visits', label: 'Visits', kinds: ['door_knock'] },
  { key: 'mail', label: 'Letters & postcards', kinds: ['letter', 'postcard'] },
  { key: 'notes', label: 'Notes', kinds: ['note'] },
  { key: 'messages', label: 'Emails & texts', kinds: ['email', 'text'] },
  { key: 'meetings', label: 'Meetings', kinds: ['meeting'] },
];

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !/^(the|and|of|llc|inc)$/i.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function BusinessDetail() {
  const { id } = useParams();
  const { businesses, saveBusinesses, deleteBusinesses, saveOwners, toast } = useStore();
  const { typeById, ownerById, activitiesByBiz } = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<ModalState>(null);
  const [wide] = useState(() => window.innerWidth > 1000);
  const b = businesses.find((x) => x.id === id);
  if (!b) return <div className="card"><Empty>Business not found. <Link to="/businesses">Back to list</Link></Empty></div>;

  const tab = (params.get('tab') as Tab) || 'activities';
  const setTab = (t: Tab) => {
    setParams(t === 'activities' ? {} : { tab: t }, { replace: true });
    // On narrow screens the tabs sit below the info panel, so bring them into view.
    if (window.innerWidth <= 1000) setTimeout(() => document.getElementById('record-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const type = typeById.get(b.type_id ?? '');
  const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
  const acts = activitiesByBiz.get(b.id) ?? [];
  const siblings = owner ? businesses.filter((x) => x.owner_id === owner.id && x.id !== b.id) : [];
  const addr = fullAddress(b);
  const update = (patch: Partial<Business>) => saveBusinesses([{ ...b, ...patch }]);
  const phone = owner?.phone || b.phone;
  const customEntries = Object.entries(b.custom ?? {}).filter(([, v]) => v !== null && v !== '');
  const fieldLabel = (k: string) => type?.fields.find((f) => f.key === k)?.label ?? k;
  const showVal = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : String(v));
  const website = b.website ? (/^https?:/.test(b.website) ? b.website : `https://${b.website}`) : null;
  const directions = addr ? googleMapsTo({ lat: b.lat ?? 0, lng: b.lng ?? 0 }, addr) : undefined;

  return (
    <div className="record">
      {/* ---------- Left: identity, quick actions, key information ---------- */}
      <aside className="record-side">
        <div className="card record-head">
          <div className="record-top">
            <Link to="/businesses" className="record-back">‹ Businesses</Link>
            <Menu trigger={<span className="record-actions">Actions ▾</span>} items={[
              { label: 'Edit business', onClick: () => setModal('edit') },
              { label: 'Change follow-up', onClick: () => setModal('followup') },
              { label: 'Get directions', href: directions, hidden: !directions },
              { label: 'Rule out', onClick: () => setModal('ruleout'), hidden: b.ruled_out },
              { label: 'Reinstate', onClick: () => update({ ruled_out: false, rule_out_reason: null, rule_out_note: null, revisit_date: null }).then(() => toast('Back in play')), hidden: !b.ruled_out },
              { label: 'Delete business', onClick: () => setModal('delete'), danger: true },
            ]} />
          </div>
          <div className="record-id">
            <div className="avatar">{initials(b.name)}</div>
            <div className="grow">
              <h1 className="record-name">{b.name}</h1>
              <div className="row" style={{ gap: 6 }}>
                <StageBadge b={b} />
                {type && <span className="badge soft">{type.name}</span>}
                <PriorityBadge p={b.priority} />
                {owner?.do_not_contact && <span className="badge danger">Do not contact</span>}
              </div>
            </div>
            <button className="icon-plain" title="Edit" onClick={() => setModal('edit')}>✎</button>
          </div>
          <div className="record-links">
            {website && <a href={website} target="_blank" rel="noreferrer">{b.website!.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>}
            {phone && <a href={`tel:${phone}`}>{phone}</a>}
            {addr && <a href={directions} target="_blank" rel="noreferrer" className="muted-link">{addr}</a>}
          </div>
          <div className="round-actions">
            <RoundAction icon="📝" label="Note" onClick={() => setModal({ log: 'note' })} />
            {phone
              ? <RoundAction icon="📞" label="Call" href={`tel:${phone}`} onClick={() => setTimeout(() => setModal({ log: 'call' }), 400)} />
              : <RoundAction icon="📞" label="Call" onClick={() => setModal({ log: 'call' })} />}
            <RoundAction icon="🚪" label="Visit" onClick={() => setModal({ log: 'door_knock' })} />
            <RoundAction icon="✉️" label="Letter" onClick={() => setModal({ log: 'letter' })} />
            <RoundAction icon="📘" label="Playbook" onClick={() => setTab('playbook')} active={tab === 'playbook'} />
            <Menu align="right" trigger={<span className="round"><span className="round-ico">⋯</span><span className="round-lbl">More</span></span>} items={[
              { label: '📮 Log postcard', onClick: () => setModal({ log: 'postcard' }) },
              { label: '📧 Log email', onClick: () => setModal({ log: 'email' }) },
              { label: '💬 Log text', onClick: () => setModal({ log: 'text' }) },
              { label: '🤝 Log meeting', onClick: () => setModal({ log: 'meeting' }) },
              { label: '🧭 Directions', href: directions, hidden: !directions },
            ]} />
          </div>
        </div>

        {b.ruled_out && (
          <div className="alert warn">
            Ruled out: <strong>{b.rule_out_reason}</strong>{b.rule_out_note ? ` — ${b.rule_out_note}` : ''}{b.revisit_date ? ` · revisit ${fmtDate(b.revisit_date)}` : ''}
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={async () => { await update({ ruled_out: false, rule_out_reason: null, rule_out_note: null, revisit_date: null }); toast('Back in play'); }}>Reinstate</button></div>
          </div>
        )}

        <details className="card record-info" open={wide}>
          <summary><span className="record-chev">⌄</span> Key information</summary>
          <InfoRow label="Stage">
            <select value={b.stage} onChange={(e) => update({ stage: e.target.value as Business['stage'] })}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </InfoRow>
          <InfoRow label="Next follow-up" action={<button className="link-btn" onClick={() => setModal('followup')}>Change</button>}>
            {b.next_action_date ? <>{fmtDate(b.next_action_date)} <FollowUpBadge date={b.next_action_date} />{b.next_action_note && <div className="small muted">{b.next_action_note}</div>}</> : <span className="muted">None scheduled</span>}
          </InfoRow>
          {b.playbook_step && !b.ruled_out && (
            <InfoRow label="Playbook" action={<button className="link-btn" onClick={() => setTab('playbook')}>Open</button>}>
              <StepBadge step={b.playbook_step} />
            </InfoRow>
          )}
          <InfoRow label="Owner" action={owner ? <Link className="link-btn" to={`/owners?focus=${owner.id}`}>Edit</Link> : <button className="link-btn" onClick={() => setModal('edit')}>Add</button>}>
            {owner ? (
              <>
                <div>{owner.name}</div>
                {owner.phone && <div><a href={`tel:${owner.phone}`}>{owner.phone}</a></div>}
                {owner.email && <div><a href={`mailto:${owner.email}`}>{owner.email}</a></div>}
                {owner.mailing_address && <div className="small muted">{owner.mailing_address}</div>}
                <label className="check small" style={{ marginTop: 4 }}><input type="checkbox" checked={owner.do_not_contact} onChange={(e) => saveOwners([{ ...owner, do_not_contact: e.target.checked }])} /> Do not contact</label>
                {siblings.length > 0 && <div className="small" style={{ marginTop: 4 }}><span className="muted">Also owns:</span> {siblings.map((s, i) => <span key={s.id}>{i > 0 && ', '}<Link to={`/businesses/${s.id}`}>{s.name}</Link></span>)}</div>}
              </>
            ) : <span className="muted">Unknown</span>}
          </InfoRow>
          {b.best_time && <InfoRow label="Best time to catch the owner">{b.best_time}</InfoRow>}
          {addr && <InfoRow label="Address">{addr}</InfoRow>}
          {b.phone && <InfoRow label="Store phone"><a href={`tel:${b.phone}`}>{b.phone}</a></InfoRow>}
          {b.email && <InfoRow label="Email"><a href={`mailto:${b.email}`}>{b.email}</a></InfoRow>}
          {b.hours && <InfoRow label="Hours">{b.hours}</InfoRow>}
          {customEntries.map(([k, v]) => <InfoRow key={k} label={fieldLabel(k)}>{showVal(v)}</InfoRow>)}
          {b.revenue != null && <InfoRow label="Revenue">{fmtMoney(b.revenue)}</InfoRow>}
          {b.sde != null && <InfoRow label="SDE / cash flow">{fmtMoney(b.sde)}</InfoRow>}
          {b.asking_price != null && <InfoRow label="Asking price">{fmtMoney(b.asking_price)}{b.sde ? ` (${(b.asking_price / b.sde).toFixed(1)}× SDE)` : ''}</InfoRow>}
          {b.source && <InfoRow label="Source">{b.source}</InfoRow>}
          {b.notes && <InfoRow label="Notes"><span style={{ whiteSpace: 'pre-wrap' }}>{b.notes}</span></InfoRow>}
          <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setModal('edit')}>Edit details</button></div>
        </details>
      </aside>

      {/* ---------- Right: tabs ---------- */}
      <section className="record-main">
        <div className="record-tabs" role="tablist" id="record-tabs">
          <button role="tab" className={tab === 'activities' ? 'on' : ''} onClick={() => setTab('activities')}>Activities <span className="tab-count">{acts.length}</span></button>
          <button role="tab" className={tab === 'playbook' ? 'on' : ''} onClick={() => setTab('playbook')}>
            Playbook {b.playbook_step && !b.ruled_out && <span className="tab-count">{STEP_INFO[b.playbook_step].n ? `Step ${STEP_INFO[b.playbook_step].n}` : STEP_INFO[b.playbook_step].short}</span>}
          </button>
          <button role="tab" className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>Map</button>
        </div>
        <div className="record-panel">
          {tab === 'activities' && <ActivitiesTab b={b} acts={acts} onLog={(k) => setModal({ log: k })} onFollowUp={() => setModal('followup')} />}
          {tab === 'playbook' && <PlaybookTab key={b.id} b={b} />}
          {tab === 'map' && <MapTab b={b} />}
        </div>
      </section>

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

function RoundAction({ icon, label, onClick, href, active }: { icon: string; label: string; onClick?: () => void; href?: string; active?: boolean }) {
  const inner = <><span className="round-ico">{icon}</span><span className="round-lbl">{label}</span></>;
  return href
    ? <a className={`round ${active ? 'on' : ''}`} href={href} onClick={onClick}>{inner}</a>
    : <button type="button" className={`round ${active ? 'on' : ''}`} onClick={onClick}>{inner}</button>;
}

function InfoRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="info-row">
      <div className="info-label"><span>{label}</span>{action}</div>
      <div className="info-value">{children}</div>
    </div>
  );
}

function ActivitiesTab({ b, acts, onLog, onFollowUp }: { b: Business; acts: Activity[]; onLog: (k: ActivityKind) => void; onFollowUp: () => void }) {
  const { deleteActivity } = useStore();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds;
  const shown = acts.filter((a) => (!kinds || kinds.includes(a.kind)) && (!q.trim() || [a.outcome, a.notes, a.campaign, kindInfo(a.kind).label].join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of shown) {
      const key = new Date(a.occurred_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      m.set(key, [...(m.get(key) ?? []), a]);
    }
    return [...m];
  }, [shown]);
  const today = todayISO();

  return (
    <div>
      <div className="subtabs">
        {FILTERS.map((f) => {
          const n = f.kinds ? acts.filter((a) => f.kinds!.includes(a.kind)).length : acts.length;
          if (f.kinds && n === 0 && f.key !== 'calls' && f.key !== 'notes') return null;
          return <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>;
        })}
      </div>
      <div className="row between" style={{ margin: '16px 0 6px' }}>
        <div className="search-pill">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activities" />
          <span aria-hidden="true">⌕</span>
        </div>
        <Menu trigger={<span className="btn primary">+ Log activity</span>} items={[
          { label: '📞 Call', onClick: () => onLog('call') },
          { label: '🚪 Visit / door knock', onClick: () => onLog('door_knock') },
          { label: '✉️ Letter', onClick: () => onLog('letter') },
          { label: '📮 Postcard', onClick: () => onLog('postcard') },
          { label: '📧 Email', onClick: () => onLog('email') },
          { label: '💬 Text', onClick: () => onLog('text') },
          { label: '🤝 Meeting', onClick: () => onLog('meeting') },
          { label: '📝 Note', onClick: () => onLog('note') },
        ]} />
      </div>

      <h3 className="feed-heading">Upcoming</h3>
      {b.next_action_date ? (
        <div className="feed-card">
          <div className="feed-top">
            <span><strong>Follow-up</strong>{b.next_action_note ? ` — ${b.next_action_note}` : ''}</span>
            <span className={b.next_action_date < today ? 'pb-overdue' : 'feed-due'}>Due {fmtDate(b.next_action_date)}</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <FollowUpBadge date={b.next_action_date} />
            <button className="link-btn" onClick={onFollowUp}>Change</button>
          </div>
        </div>
      ) : (
        <div className="feed-card muted">Nothing scheduled. <button className="link-btn" onClick={onFollowUp}>Schedule a follow-up</button></div>
      )}

      {groups.length === 0 && <Empty>{acts.length ? 'No activities match.' : 'No activity yet. Use the buttons on the left, or + Log activity.'}</Empty>}
      {groups.map(([month, list]) => (
        <div key={month}>
          <h3 className="feed-heading">{month}</h3>
          {list.map((a) => (
            <div key={a.id} className="feed-card">
              <div className="feed-top">
                <span><span className="feed-ico">{kindInfo(a.kind).icon}</span> <strong>{kindInfo(a.kind).label}</strong>{a.outcome ? ` — ${a.outcome}` : ''}</span>
                <span className="muted small nowrap">{fmtDateTime(a.occurred_at)}</span>
              </div>
              {(a.notes || a.campaign) && (
                <div className="feed-body">
                  {a.campaign && <span className="badge soft" style={{ marginRight: 8 }}>{a.campaign}</span>}
                  {a.notes && <span style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</span>}
                </div>
              )}
              <button className="feed-del" title="Delete activity" onClick={() => { if (confirm('Delete this activity?')) deleteActivity(a.id); }}>✕</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MapTab({ b }: { b: Business }) {
  const { retryGeocoding } = useStore();
  const addr = fullAddress(b);
  if (b.lat == null) {
    return (
      <Empty>
        {b.geocode_status === 'pending' && addr ? 'Looking up the location…' : b.geocode_status === 'failed' ? <>Couldn't find this address on the map. <button className="btn sm" onClick={() => retryGeocoding([b.id])}>Retry</button></> : 'No address yet.'}
        <div className="small" style={{ marginTop: 8 }}>You can also enter coordinates under Edit → Deal numbers, notes & map location.</div>
      </Empty>
    );
  }
  return <MapView businesses={[b]} className="map" />;
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
