import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import type { Business, PlaybookStep, Profile } from '../lib/types';
import { ALL_STEPS, PROFILE_FIELDS, STEP_INFO, missingProfile, stepDue } from '../lib/playbook';
import { FIRST_MEETING, INTRO, NDA_DOCS, STEP_CONTENT, TOUGH_QUESTIONS } from '../lib/playbookContent';
import { fmtDate, fullAddress, todayISO } from '../lib/util';
import { printEnvelopes, printLetters } from '../lib/print';
import { PlaybookBlocks } from '../components/PlaybookBlocks';
import { StepDots } from '../components/PlaybookPanel';
import { ActivityLogger } from '../components/ActivityLogger';
import { Empty, Field, Modal, PriorityBadge, StageBadge } from '../components/ui';

export function ProfileForm({ compact = false }: { compact?: boolean }) {
  const { settings, saveSettings, toast } = useStore();
  const [p, setP] = useState<Profile>(settings.profile ?? {});
  const dirty = JSON.stringify(p) !== JSON.stringify(settings.profile ?? {});
  return (
    <div className="stack">
      {!compact && <p className="small muted">Filled into every script and letter. Saved with your data, not in the app's code.</p>}
      <div className="grid form">
        {PROFILE_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input value={p[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setP({ ...p, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div><button className="btn primary" disabled={!dirty} onClick={async () => { await saveSettings({ ...settings, profile: p }); toast('Your details are saved'); }}>Save my details</button></div>
    </div>
  );
}

export function Playbook() {
  const { businesses, settings } = useStore();
  const { ownerById } = useLookups();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLog, setBulkLog] = useState<null | { campaign: string; kind: 'letter' | 'door_knock' }>(null);
  const today = todayISO();

  const onPlaybook = businesses.filter((b) => b.playbook_step && !b.ruled_out);
  const byStep = useMemo(() => {
    const m = new Map<PlaybookStep, Business[]>();
    for (const s of ALL_STEPS) m.set(s, []);
    for (const b of onPlaybook) m.get(b.playbook_step!)!.push(b);
    for (const list of m.values()) list.sort((a, b) => a.priority - b.priority || (stepDue(a) ?? '9999').localeCompare(stepDue(b) ?? '9999') || a.name.localeCompare(b.name));
    return m;
  }, [onPlaybook]);
  const firstWithItems = ALL_STEPS.find((s) => byStep.get(s)!.length) ?? 'find_owner';
  const step = (params.get('step') as PlaybookStep) || firstWithItems;
  const list = byStep.get(step) ?? [];
  const missing = missingProfile(settings.profile);
  useEffect(() => setSelected(new Set()), [step]);
  useEffect(() => {
    if (window.location.hash === '#details') document.getElementById('details')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const chosen = list.filter((b) => selected.has(b.id));
  const targets = chosen.length ? chosen : list;
  const recipients = targets.map((b) => ({ business: b, owner: b.owner_id ? ownerById.get(b.owner_id) : undefined }));
  const allSelected = list.length > 0 && list.every((b) => selected.has(b.id));
  const info = STEP_INFO[step];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Outreach playbook</h1>
          <div className="page-sub">Learn each owner's name, mail Letter 1, stop in to meet them, and leave Letter 2 if they're out.</div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="card" id="details">
          <h2>First, your details</h2>
          <ProfileForm />
        </div>
      )}

      <div className="pb-steps">
        {ALL_STEPS.map((s) => {
          const items = byStep.get(s)!;
          const dueCount = items.filter((b) => { const d = stepDue(b); return d && d <= today; }).length;
          const si = STEP_INFO[s];
          return (
            <button key={s} className={`pb-step ${s === step ? 'on' : ''}`} onClick={() => setParams({ step: s }, { replace: true })}>
              <span className="pb-step-n">{si.n ?? (s === 'done' ? '✓' : '💬')}</span>
              <span className="pb-step-t">{si.short}</span>
              <span className="pb-step-c">{items.length}{dueCount > 0 && <em> · {dueCount} due</em>}</span>
            </button>
          );
        })}
      </div>

      <div className="card tight">
        <div style={{ padding: '20px 24px 8px' }}>
          <div className="row between">
            <div>
              <h2 style={{ margin: 0 }}>{info.n ? `Step ${info.n}: ` : ''}{info.title} <span className="muted small">({list.length})</span></h2>
              <div className="small muted">{info.when}{info.target ? ` · target ${fmtDate(info.target)}` : ''}</div>
            </div>
            <div className="row">
              {step === 'letter1' && list.length > 0 && (
                <>
                  <button className="btn" onClick={() => printLetters(1, recipients, settings.profile ?? {})}>🖨 Print Letter 1 ({targets.length})</button>
                  <button className="btn" onClick={() => printEnvelopes(1, recipients)}>Envelopes</button>
                  <button className="btn primary" onClick={() => setBulkLog({ campaign: 'Letter 1', kind: 'letter' })}>Log mailed ({targets.length})</button>
                </>
              )}
              {step === 'visit' && list.length > 0 && (
                <>
                  <button className="btn" onClick={() => printLetters(2, recipients, settings.profile ?? {})}>🖨 Letter 2 to bring ({targets.length})</button>
                  <button className="btn" onClick={() => printEnvelopes(2, recipients)}>Envelopes</button>
                  <Link className="btn primary" to="/routes?playbook=visit">Plan a visit route</Link>
                </>
              )}
              {step === 'letter2' && list.length > 0 && (
                <>
                  <button className="btn" onClick={() => printLetters(2, recipients, settings.profile ?? {}, true)}>🖨 Letter 2, mailed ({targets.length})</button>
                  <button className="btn" onClick={() => printEnvelopes(2, recipients)}>Envelopes</button>
                  <button className="btn primary" onClick={() => setBulkLog({ campaign: 'Letter 2', kind: 'letter' })}>Log mailed ({targets.length})</button>
                </>
              )}
            </div>
          </div>
          {STEP_CONTENT[step] && <p className="small" style={{ marginTop: 10 }}>{STEP_CONTENT[step]!.goal}</p>}
          {list.length > 0 && (step === 'letter1' || step === 'visit' || step === 'letter2') && (
            <label className="check small" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((b) => b.id)))} />
              {chosen.length ? `${chosen.length} selected` : 'Select some (buttons apply to all when none are selected)'}
            </label>
          )}
        </div>
        {list.length === 0 ? <Empty>No businesses at this step.</Empty> : list.map((b) => {
          const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
          const due = stepDue(b);
          const phone = owner?.phone || b.phone;
          return (
            <div key={b.id} className="list-item" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {(step === 'letter1' || step === 'visit' || step === 'letter2') && (
                <input type="checkbox" style={{ marginTop: 4 }} checked={selected.has(b.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} />
              )}
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <Link to={`/businesses/${b.id}`}><strong>{b.name}</strong></Link>
                  <StageBadge b={b} /> <PriorityBadge p={b.priority} />
                </div>
                <div className="small muted">{fullAddress(b)}</div>
                <div className="small" style={{ marginTop: 2 }}>
                  <span className="muted">Owner:</span> {owner ? owner.name : <em className="muted">unknown</em>}
                  {b.best_time && <> · <span className="muted">Best time:</span> {b.best_time}</>}
                  {b.next_action_note && step !== 'find_owner' && <> · <span className="muted">{b.next_action_note}</span></>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }} className="small">
                {due && <div className={due < today ? 'pb-overdue' : 'muted'}>{fmtDate(due)}</div>}
                {phone && step === 'find_owner' && <a href={`tel:${phone}`}>{phone}</a>}
                <div><Link to={`/businesses/${b.id}`}>Open →</Link></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Read the playbook</h2>
        <PlaybookBlocks blocks={INTRO} ctx={{ profile: settings.profile ?? {} }} />
        {(['find_owner', 'scout', 'letter1', 'visit', 'letter2'] as PlaybookStep[]).map((s) => (
          <details key={s} className="pb-details">
            <summary><StepDots step={s} /> Step {STEP_INFO[s].n}: {STEP_INFO[s].title}</summary>
            <p>{STEP_CONTENT[s]!.goal}</p>
            <PlaybookBlocks blocks={STEP_CONTENT[s]!.blocks} ctx={{ profile: settings.profile ?? {} }} />
          </details>
        ))}
        <details className="pb-details"><summary>Tough questions</summary><PlaybookBlocks blocks={TOUGH_QUESTIONS} ctx={{ profile: settings.profile ?? {} }} /></details>
        <details className="pb-details"><summary>First-meeting guide</summary><PlaybookBlocks blocks={[...FIRST_MEETING, { t: 'h', text: 'What to ask for after the NDA' }, ...NDA_DOCS]} ctx={{ profile: settings.profile ?? {} }} /></details>
      </div>

      {missing.length === 0 && (
        <details className="card" id="details">
          <summary style={{ cursor: 'pointer' }}><strong>Your details</strong> <span className="small muted">(used in scripts and letters)</span></summary>
          <div style={{ marginTop: 12 }}><ProfileForm compact /></div>
        </details>
      )}

      {bulkLog && (
        <Modal title={`Log ${bulkLog.campaign} for ${targets.length} businesses`} onClose={() => setBulkLog(null)}>
          <ActivityLogger businessIds={targets.map((b) => b.id)} defaultKind={bulkLog.kind} defaultCampaign={bulkLog.campaign} defaultOutcome="Sent" kinds={['letter']}
            onDone={() => { setBulkLog(null); setSelected(new Set()); }} />
        </Modal>
      )}
    </div>
  );
}
