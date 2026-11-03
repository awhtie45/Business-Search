import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import type { ActivityKind, Business, PlaybookStep } from '../lib/types';
import { ALL_STEPS, SEQUENCE, STEP_INFO, isCompanyName, missingProfile, playbookAppliesTo, stepDue } from '../lib/playbook';
import { FIRST_MEETING, NDA_DOCS, STEP_CONTENT, TOUGH_QUESTIONS, VOICEMAIL } from '../lib/playbookContent';
import { fmtDate, todayISO } from '../lib/util';
import { printEnvelopes, printLetters } from '../lib/print';
import { PlaybookBlocks } from './PlaybookBlocks';
import { ActivityLogger } from './ActivityLogger';
import { Modal } from './ui';

type LogPreset = { kind: ActivityKind; campaign?: string; outcome?: string; title: string };

export function StepDots({ step }: { step: PlaybookStep | null | undefined }) {
  const idx = step ? SEQUENCE.indexOf(step) : -1;
  const finished = step === 'done' || step === 'conversation';
  return (
    <span className="pb-dots" aria-hidden="true">
      {SEQUENCE.map((s, i) => <span key={s} className={`pb-dot ${finished || i < idx ? 'past' : i === idx ? 'now' : ''}`} />)}
    </span>
  );
}

export function StepBadge({ step }: { step: PlaybookStep | null | undefined }) {
  if (!step) return null;
  const info = STEP_INFO[step];
  return <span className={`badge pb-badge pb-${step}`}>{info.n ? `Step ${info.n}: ${info.short}` : info.short}</span>;
}

export function PlaybookPanel({ b }: { b: Business }) {
  const { saveBusinesses, settings, toast } = useStore();
  const { typeById, ownerById } = useLookups();
  const [log, setLog] = useState<LogPreset | null>(null);
  const [bestTime, setBestTime] = useState(b.best_time ?? '');
  const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
  const ctx = { profile: settings.profile ?? {}, business: b, owner };
  const step = b.playbook_step;
  const applies = playbookAppliesTo(typeById.get(b.type_id ?? ''));

  if (!step) {
    if (!applies || b.ruled_out) return null;
    return (
      <div className="card pb-card">
        <div className="row between">
          <div><h2 style={{ margin: 0 }}>Outreach playbook</h2><div className="small muted">This laundromat isn't on the playbook.</div></div>
          <button className="btn primary" onClick={() => saveBusinesses([{ ...b, playbook_step: 'find_owner' }])}>Start at Step 1</button>
        </div>
      </div>
    );
  }

  const info = STEP_INFO[step];
  const content = STEP_CONTENT[step];
  const due = stepDue(b);
  const overdue = due && due < todayISO();
  const move = (s: PlaybookStep | null) => saveBusinesses([{ ...b, playbook_step: s }]).then(() => toast(s ? `Moved to ${STEP_INFO[s].title}` : 'Removed from playbook'));
  const nextInSequence = (): PlaybookStep => {
    const i = SEQUENCE.indexOf(step);
    return i >= 0 && i < SEQUENCE.length - 1 ? SEQUENCE[i + 1] : 'done';
  };
  const missing = missingProfile(settings.profile);
  const phone = owner?.phone || b.phone;

  const actions: { label: string; primary?: boolean; onClick?: () => void; href?: string }[] = [];
  if (step === 'find_owner') {
    if (phone) actions.push({ label: '📞 Call the store', primary: true, href: `tel:${phone}`, onClick: () => setTimeout(() => setLog({ kind: 'call', title: 'Step 1 call' }), 400) });
    actions.push({ label: 'Log call', primary: !phone, onClick: () => setLog({ kind: 'call', title: 'Step 1 call' }) });
  } else if (step === 'scout') {
    actions.push({ label: '🚪 Log scouting visit', primary: true, onClick: () => setLog({ kind: 'door_knock', campaign: 'Scouting', title: 'Scouting stop-in' }) });
    actions.push({ label: 'Skip scouting', onClick: () => move('letter1') });
  } else if (step === 'letter1') {
    actions.push({ label: '🖨 Print Letter 1', onClick: () => { printLetters(1, [{ business: b, owner }], ctx.profile); } });
    actions.push({ label: 'Print envelope', onClick: () => printEnvelopes(1, [{ business: b, owner }]) });
    actions.push({ label: '✉️ Log Letter 1 mailed', primary: true, onClick: () => setLog({ kind: 'letter', campaign: 'Letter 1', outcome: 'Sent', title: 'Letter 1 mailed' }) });
  } else if (step === 'visit') {
    actions.push({ label: '🚪 Log visit', primary: true, onClick: () => setLog({ kind: 'door_knock', campaign: 'Step 4 visit', title: 'Step 4 visit' }) });
    actions.push({ label: '🖨 Print Letter 2 (bring it)', onClick: () => printLetters(2, [{ business: b, owner }], ctx.profile) });
  } else if (step === 'letter2') {
    actions.push({ label: '🖨 Print Letter 2 (mailed version)', onClick: () => printLetters(2, [{ business: b, owner }], ctx.profile, true) });
    actions.push({ label: '✉️ Log Letter 2 left or mailed', primary: true, onClick: () => setLog({ kind: 'letter', campaign: 'Letter 2', outcome: 'Sent', title: 'Letter 2' }) });
    actions.push({ label: '🚪 Log another visit', onClick: () => setLog({ kind: 'door_knock', campaign: 'Step 4 visit', title: 'Step 4 visit' }) });
  }

  const scriptFor = (kind: ActivityKind) => {
    const all = content?.blocks ?? [];
    // On a call you need the scripts, not the research list that follows them.
    const cut = all.findIndex((x) => x.t === 'h' && /where names come from/i.test(x.text));
    const blocks = (cut >= 0 ? all.slice(0, cut) : all).filter((x) => x.t !== 'letter' && x.t !== 'check');
    return (
      <details className="pb-aside" open={kind === 'call' || kind === 'door_knock'}>
        <summary>Script for {info.title.toLowerCase()}</summary>
        <PlaybookBlocks blocks={kind === 'call' && step !== 'find_owner' ? [{ t: 'h', text: 'Voicemail' }, VOICEMAIL] : blocks} ctx={ctx} />
      </details>
    );
  };

  return (
    <div className="card pb-card">
      <div className="row between top">
        <div className="grow">
          <div className="small muted">Outreach playbook</div>
          <h2 style={{ margin: '2px 0 6px' }}>{info.n ? `Step ${info.n} of 5: ` : ''}{info.title}</h2>
          <div className="row" style={{ gap: 10 }}>
            <StepDots step={step} />
            {due && <span className={`small ${overdue ? 'pb-overdue' : 'muted'}`}>{info.n && info.n <= 3 ? 'Target' : 'Due'} {fmtDate(due)}{overdue ? ' · overdue' : ''}</span>}
            {info.when && <span className="small muted">· {info.when}</span>}
          </div>
        </div>
        <select value={step} onChange={(e) => move(e.target.value === '__none' ? null : (e.target.value as PlaybookStep))} style={{ width: 'auto' }} aria-label="Move to step">
          {ALL_STEPS.map((s) => <option key={s} value={s}>{STEP_INFO[s].n ? `Step ${STEP_INFO[s].n}: ${STEP_INFO[s].title}` : STEP_INFO[s].title}</option>)}
          <option value="__none">Remove from playbook</option>
        </select>
      </div>

      {missing.length > 0 && (
        <div className="alert warn small" style={{ marginTop: 12 }}>Add your details so scripts and letters fill in: <Link to="/playbook#details">{missing.join(', ')}</Link></div>
      )}
      {content && <p style={{ marginTop: 12 }}>{content.goal}</p>}

      {step === 'find_owner' && owner && isCompanyName(owner.name) && (
        <div className="alert warn small">The owner on file is a company (<strong>{owner.name}</strong>). Letter 1 will open with "Hello," unless you find the person behind it. bizfile Online lists an LLC's managers or officers. <button className="btn sm" onClick={() => move('letter1')}>Use "Hello," → Letter 1</button></div>
      )}
      {step === 'find_owner' && owner && !isCompanyName(owner.name) && (
        <div className="alert ok small">You already have a name: <strong>{owner.name}</strong>. If it's confirmed, move on. <button className="btn sm" onClick={() => move('letter1')}>Name confirmed → Letter 1</button></div>
      )}
      {step === 'find_owner' && !owner && <p className="small muted">Got a name? Add the owner with <strong>Edit</strong> above, and this moves to Letter 1 automatically.</p>}

      {actions.length > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          {actions.map((a) => a.href
            ? <a key={a.label} className={`btn ${a.primary ? 'primary' : ''}`} href={a.href} onClick={a.onClick}>{a.label}</a>
            : <button key={a.label} className={`btn ${a.primary ? 'primary' : ''}`} onClick={a.onClick}>{a.label}</button>)}
          {SEQUENCE.includes(step) && step !== 'scout' && <button className="btn sm" onClick={() => move(nextInSequence())}>Mark step done</button>}
        </div>
      )}

      <div className="grid form" style={{ marginTop: 14 }}>
        <label className="field">
          <span>Best time to catch the owner</span>
          <input value={bestTime} onChange={(e) => setBestTime(e.target.value)} onBlur={() => bestTime !== (b.best_time ?? '') && saveBusinesses([{ ...b, best_time: bestTime || null }])}
            placeholder="e.g. Weekday mornings around 9; collects Tuesdays" />
        </label>
      </div>

      {content && (
        <details className="pb-details" open={step === 'find_owner' || step === 'visit'}>
          <summary>Scripts & checklist for this step</summary>
          <PlaybookBlocks blocks={content.blocks} ctx={ctx} />
        </details>
      )}
      {(step === 'conversation' || b.stage === 'conversation') && (
        <details className="pb-details" open>
          <summary>First-meeting guide</summary>
          <PlaybookBlocks blocks={FIRST_MEETING} ctx={ctx} />
        </details>
      )}
      {(b.stage === 'nda' || b.stage === 'financials') && (
        <details className="pb-details" open>
          <summary>Documents to request after the NDA</summary>
          <PlaybookBlocks blocks={NDA_DOCS} ctx={ctx} />
        </details>
      )}
      <details className="pb-details">
        <summary>Tough questions</summary>
        <PlaybookBlocks blocks={TOUGH_QUESTIONS} ctx={ctx} />
      </details>
      {step === 'done' && <p className="small muted" style={{ marginTop: 10 }}>All five steps are done for this store. Your next follow-up is on the left. Use the menu above to restart a step.</p>}

      {log && (
        <Modal title={`${log.title} — ${b.name}`} onClose={() => setLog(null)}>
          <ActivityLogger businessIds={[b.id]} defaultKind={log.kind} defaultCampaign={log.campaign} defaultOutcome={log.outcome} aside={scriptFor(log.kind)} onDone={() => setLog(null)} />
        </Modal>
      )}
    </div>
  );
}
