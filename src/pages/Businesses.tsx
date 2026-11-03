import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import { RULE_OUT_REASONS, STAGES, kindInfo, type Business } from '../lib/types';
import { downloadText, fmtDate, fullAddress, toCSV, todayISO } from '../lib/util';
import { splitAddress } from '../lib/importer';
import { Empty, FollowUpBadge, Field, Modal, StageBadge } from '../components/ui';
import { ActivityLogger } from '../components/ActivityLogger';
import { StepBadge } from '../components/PlaybookPanel';
import { ALL_STEPS, STEP_INFO } from '../lib/playbook';

type SortKey = 'name' | 'last' | 'next' | 'added' | 'city';

export function Businesses() {
  const { businesses, types, saveBusinesses, deleteBusinesses, toast } = useStore();
  const { typeById, ownerById, activitiesByBiz } = useLookups();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<'log' | 'ruleout' | 'stage' | 'delete' | null>(null);

  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const stage = params.get('stage') ?? '';
  const status = params.get('status') ?? 'active';
  const contact = params.get('contact') ?? '';
  const pbStep = params.get('step') ?? '';
  const sort = (params.get('sort') as SortKey) ?? 'name';
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const today = todayISO();
    const list = businesses.filter((b) => {
      if (status === 'active' && b.ruled_out) return false;
      if (status === 'ruled_out' && !b.ruled_out) return false;
      if (type && (b.type_id ?? '') !== (type === 'none' ? '' : type)) return false;
      if (stage && b.stage !== stage) return false;
      if (contact === 'never' && b.last_activity_at) return false;
      if (contact === 'contacted' && !b.last_activity_at) return false;
      if (contact === 'due' && !(b.next_action_date && b.next_action_date <= today)) return false;
      if (contact === 'nomap' && b.lat != null) return false;
      if (pbStep && (pbStep === 'none' ? !!b.playbook_step : b.playbook_step !== pbStep)) return false;
      if (needle) {
        const owner = b.owner_id ? ownerById.get(b.owner_id)?.name : '';
        const hay = [b.name, b.address, b.city, b.state, b.zip, b.phone, owner, b.notes, b.source].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: Business, b: Business) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      city: (a, b) => (a.city ?? '').localeCompare(b.city ?? '') || a.name.localeCompare(b.name),
      last: (a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''),
      next: (a, b) => (a.next_action_date ?? '9999').localeCompare(b.next_action_date ?? '9999'),
      added: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    };
    return list.sort(cmp[sort] ?? cmp.name);
  }, [businesses, q, type, stage, status, contact, sort, ownerById, pbStep]);

  const ruledOutCount = businesses.filter((b) => b.ruled_out).length;
  const allSelected = filtered.length > 0 && filtered.every((b) => selected.has(b.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedList = filtered.filter((b) => selected.has(b.id));

  function exportCSV(mail: boolean) {
    const rows = selectedList.length ? selectedList : filtered;
    let skipped = 0;
    if (mail) {
      const out: unknown[][] = [];
      for (const b of rows) {
        const o = b.owner_id ? ownerById.get(b.owner_id) : undefined;
        if (o?.do_not_contact) { skipped++; continue; }
        const ownerAddr = o?.mailing_address ? splitAddress(o.mailing_address) : null;
        const a = ownerAddr ?? { address: b.address ?? '', city: b.city ?? '', state: b.state ?? '', zip: b.zip ?? '' };
        out.push([o?.name || 'Owner', b.name, a.address, a.city, a.state, a.zip, ownerAddr ? 'Owner mailing' : 'Business', b.id]);
      }
      downloadText(`mailing-list-${todayISO()}.csv`, toCSV(['name', 'company', 'address_line1', 'city', 'state', 'zip', 'address_type', 'record_id'], out));
      toast(`Exported ${out.length} addresses${skipped ? ` (skipped ${skipped} do-not-contact)` : ''}`);
    } else {
      const fields = new Set<string>();
      rows.forEach((b) => Object.keys(b.custom ?? {}).forEach((k) => fields.add(k)));
      const extra = [...fields];
      const headers = ['Name', 'Type', 'Stage', 'Ruled out', 'Rule-out reason', 'Address', 'City', 'State', 'ZIP', 'Phone', 'Email', 'Website', 'Owner', 'Owner phone', 'Owner email', 'Last activity', 'Next follow-up', 'Follow-up note', 'Touches', 'Revenue', 'SDE', 'Asking price', 'Source', 'Notes', ...extra];
      const data = rows.map((b) => {
        const o = b.owner_id ? ownerById.get(b.owner_id) : undefined;
        return [b.name, typeById.get(b.type_id ?? '')?.name, STAGES.find((s) => s.key === b.stage)?.label, b.ruled_out ? 'Yes' : '', b.rule_out_reason, b.address, b.city, b.state, b.zip, b.phone, b.email, b.website, o?.name, o?.phone, o?.email, b.last_activity_at?.slice(0, 10), b.next_action_date, b.next_action_note, activitiesByBiz.get(b.id)?.length ?? 0, b.revenue, b.sde, b.asking_price, b.source, b.notes, ...extra.map((k) => b.custom?.[k])];
      });
      downloadText(`businesses-${todayISO()}.csv`, toCSV(headers, data));
    }
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>Businesses <span className="muted small">({filtered.length})</span></h1>
          {status === 'active' && ruledOutCount > 0 && (
            <div className="small muted">
              {ruledOutCount} ruled-out business{ruledOutCount === 1 ? ' is' : 'es are'} hidden (kept, not deleted) ·{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setParam('status', 'ruled_out'); }}>Show ruled out</a>
            </div>
          )}
        </div>
        <div className="row">
          <Link className="btn" to="/import">Import</Link>
          <Link className="btn primary" to="/businesses/new">+ Add</Link>
        </div>
      </div>

      <div className="card">
        <div className="grid form">
          <input placeholder="Search name, address, owner, notes…" value={q} onChange={(e) => setParam('q', e.target.value)} className="span-all" />
          <select value={type} onChange={(e) => setParam('type', e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="none">No type</option>
          </select>
          <select value={stage} onChange={(e) => setParam('stage', e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setParam('status', e.target.value === 'active' ? '' : e.target.value)}>
            <option value="active">Active (not ruled out)</option>
            <option value="ruled_out">Ruled out</option>
            <option value="all">Everything</option>
          </select>
          <select value={contact} onChange={(e) => setParam('contact', e.target.value)}>
            <option value="">Any contact history</option>
            <option value="never">Never contacted</option>
            <option value="contacted">Contacted at least once</option>
            <option value="due">Follow-up due</option>
            <option value="nomap">Missing map location</option>
          </select>
          <select value={pbStep} onChange={(e) => setParam('step', e.target.value)}>
            <option value="">Any playbook step</option>
            {ALL_STEPS.map((s) => <option key={s} value={s}>{STEP_INFO[s].n ? `Step ${STEP_INFO[s].n}: ${STEP_INFO[s].title}` : STEP_INFO[s].title}</option>)}
            <option value="none">Not on the playbook</option>
          </select>
          <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'name' ? '' : e.target.value)}>
            <option value="name">Sort: Name</option>
            <option value="city">Sort: City</option>
            <option value="last">Sort: Last activity</option>
            <option value="next">Sort: Next follow-up</option>
            <option value="added">Sort: Recently added</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <label className="check"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((b) => b.id)))} /> Select all</label>
        {selected.size > 0 && <span className="small muted">{selectedList.length} selected</span>}
        <div className="grow" />
        {selectedList.length > 0 && (
          <>
            <button className="btn sm" onClick={() => setModal('log')}>Log activity</button>
            <button className="btn sm" onClick={() => setModal('stage')}>Set stage</button>
            <button className="btn sm" onClick={() => setModal('ruleout')}>Rule out</button>
            <button className="btn sm danger" onClick={() => setModal('delete')}>Delete</button>
          </>
        )}
        <button className="btn sm" onClick={() => exportCSV(true)} title="Owner name + mailing address, ready for a print-and-mail service">Export mailing list</button>
        <button className="btn sm" onClick={() => exportCSV(false)}>Export CSV</button>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><Empty>No businesses match. <Link to="/businesses/new">Add one</Link> or <Link to="/import">import a list</Link>.</Empty></div>
      ) : (
        <>
          <div className="card tight hide-mobile">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th style={{ width: 30 }} /><th>Name</th><th>Location</th><th>Owner</th><th>Stage</th><th>Last touch</th><th>Follow-up</th></tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const last = activitiesByBiz.get(b.id)?.[0];
                    return (
                      <tr key={b.id} className={`click ${b.ruled_out ? 'dim' : ''}`} onClick={() => navigate(`/businesses/${b.id}`)}>
                        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} /></td>
                        <td>
                          <strong>{b.name}</strong>
                          <div className="small muted">{typeById.get(b.type_id ?? '')?.name}{b.lat == null ? ' · no map pin' : ''}</div>
                        </td>
                        <td className="small">{b.address}<div className="muted">{[b.city, b.state].filter(Boolean).join(', ')}</div></td>
                        <td className="small">{b.owner_id ? ownerById.get(b.owner_id)?.name : <span className="muted">—</span>}</td>
                        <td><StageBadge b={b} />{b.playbook_step && !b.ruled_out && <div style={{ marginTop: 4 }}><StepBadge step={b.playbook_step} /></div>}{b.ruled_out && b.rule_out_reason && <div className="small muted">{b.rule_out_reason}</div>}</td>
                        <td className="small nowrap">{last ? <>{kindInfo(last.kind).icon} {fmtDate(last.occurred_at)}<div className="muted">{last.outcome}</div></> : <span className="muted">Never</span>}</td>
                        <td className="small nowrap">{b.next_action_date ? <>{fmtDate(b.next_action_date)} <FollowUpBadge date={b.next_action_date} /></> : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card tight hide-desktop">
            {filtered.map((b) => {
              const last = activitiesByBiz.get(b.id)?.[0];
              return (
                <div key={b.id} className="list-item row top" style={{ flexWrap: 'nowrap' }}>
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} style={{ marginTop: 4 }} />
                  <Link to={`/businesses/${b.id}`} className="grow" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="row between"><strong>{b.name}</strong><StageBadge b={b} /></div>
                    <div className="small muted">{fullAddress(b)}</div>
                    <div className="small muted">
                      {last ? `${kindInfo(last.kind).icon} ${fmtDate(last.occurred_at)}${last.outcome ? ` · ${last.outcome}` : ''}` : 'Never contacted'}
                      {b.next_action_date && <> · next {fmtDate(b.next_action_date)} <FollowUpBadge date={b.next_action_date} /></>}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal === 'log' && (
        <Modal title={`Log activity for ${selectedList.length} businesses`} onClose={() => setModal(null)}>
          <ActivityLogger businessIds={selectedList.map((b) => b.id)} defaultKind="postcard" onDone={() => { setModal(null); setSelected(new Set()); }} />
        </Modal>
      )}
      {modal === 'ruleout' && (
        <RuleOutModal count={selectedList.length} onClose={() => setModal(null)} onSave={async (reason, note, revisit) => {
          await saveBusinesses(selectedList.map((b) => ({ ...b, ruled_out: true, rule_out_reason: reason, rule_out_note: note || null, revisit_date: revisit || null, next_action_date: null })));
          toast(`Ruled out ${selectedList.length}`);
          setSelected(new Set());
          setModal(null);
        }} />
      )}
      {modal === 'stage' && (
        <Modal title="Set stage" onClose={() => setModal(null)}>
          <div className="chips">
            {STAGES.map((s) => (
              <button key={s.key} className="chip big" onClick={async () => {
                await saveBusinesses(selectedList.map((b) => ({ ...b, stage: s.key })));
                toast(`Moved ${selectedList.length} to ${s.label}`);
                setModal(null);
              }}>{s.label}</button>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete businesses?" onClose={() => setModal(null)}>
          <p>This permanently deletes {selectedList.length} businesses and their activity history. To keep a record that you passed on them, use <strong>Rule out</strong> instead.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn danger" onClick={async () => { await deleteBusinesses(selectedList.map((b) => b.id)); setSelected(new Set()); setModal(null); toast('Deleted'); }}>Delete permanently</button>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function RuleOutModal({ count, onClose, onSave }: { count: number; onClose: () => void; onSave: (reason: string, note: string, revisit: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [revisit, setRevisit] = useState('');
  return (
    <Modal title={count > 1 ? `Rule out ${count} businesses` : 'Rule out'} onClose={onClose}>
      <div className="stack">
        <div className="chips">
          {RULE_OUT_REASONS.map((r) => <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <Field label="Note (optional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Revisit on (optional) — it will show up on your Today page">
          <input type="date" value={revisit} onChange={(e) => setRevisit(e.target.value)} />
        </Field>
        <div className="chips">
          {[['6 months', 182], ['1 year', 365], ['2 years', 730]].map(([l, d]) => (
            <button key={l} className="chip" onClick={() => { const x = new Date(); x.setDate(x.getDate() + Number(d)); setRevisit(x.toISOString().slice(0, 10)); }}>Revisit in {l}</button>
          ))}
        </div>
        <button className="btn primary block" disabled={!reason} onClick={() => onSave(reason, note, revisit)}>Rule out</button>
      </div>
    </Modal>
  );
}
