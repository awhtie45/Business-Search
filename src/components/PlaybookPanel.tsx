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

/** The Playbook tab on a business page: the five steps as an outline, current step open with its actions. */
export function PlaybookTab({ b }: { b: Business }) {
  const { saveBusinesses, settings, toast } = useStore();
  const { typeById, ownerById } = useLookups();
  const [log, setLog] = useState<LogPreset | null>(null);
  const [bestTime, setBestTime] = useState(b.best_time ?? '');
  const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
  const ctx = { profile: settings.profile ?? {}, business: b, owner };
  const step = b.playbook_step;
  const applies = playbookAppliesTo(typeById.get(b.type_id ?? ''));

  if (!step) {
    return (
      <div className="empty">
        <p>{applies ? "This laundromat isn't on the outreach playbook." : 'The outreach playbook is set up for laundromats.'}</p>
        {!b.ruled_out && <button className="btn primary" onClick={() => saveBusinesses([{ ...b, playbook_step: 'find_owner' }])}>Start at Step 1</button>}
      </div>
    );
  }

  const info = STEP_INFO[step];
  const currentIdx = SEQUENCE.indexOf(step);
  const finished = step === 'done' || step === 'conversation';
  const due = stepDue(b);
  const overdue = due && due < todayISO();
  const move = (s: PlaybookStep | null) => saveBusinesses([{ ...b, playbook_step: s }]).then(() => toast(s ? `Moved to ${STEP_INFO[s].title}` : 'Removed from playbook'));
  const nextInSequence = (): PlaybookStep => (currentIdx >= 0 && currentIdx < SEQUENCE.length - 1 ? SEQUENCE[currentIdx + 1] : 'done');
  const missing = missingProfile(settings.profile);
  const phone = owner?.phone || b.phone;

  function actionsFor(s: PlaybookStep) {
    const list: { label: string; primary?: boolean; onClick?: () => void; href?: string }[] = [];
    if (s === 'find_owner') {
      if (phone) list.push({ label: '📞 Call the store', primary: true, href: `tel:${phone}`, onClick: () => setTimeout(() => setLog({ kind: 'call', title: 'Step 1 call' }), 400) });
      list.push({ label: 'Log call', primary: !phone, onClick: () => setLog({ kind: 'call', title: 'Step 1 call' }) });
    } else if (s === 'scout') {
      list.push({ label: '🚪 Log scouting visit', primary: true, onClick: () => setLog({ kind: 'door_knock', campaign: 'Scouting', title: 'Scouting stop-in' }) });
      list.push({ label: 'Skip scouting', onClick: () => move('letter1') });
    } else if (s === 'letter1') {
      list.push({ label: '🖨 Print Letter 1', onClick: () => printLetters(1, [{ business: b, owner }], ctx.profile) });
      list.push({ label: 'Print envelope', onClick: () => printEnvelopes(1, [{ business: b, owner }]) });
      list.push({ label: '✉️ Log Letter 1 mailed', primary: true, onClick: () => setLog({ kind: 'letter', campaign: 'Letter 1', outcome: 'Sent', title: 'Letter 1 mailed' }) });
    } else if (s === 'visit') {
      list.push({ label: '🚪 Log visit', primary: true, onClick: () => setLog({ kind: 'door_knock', campaign: 'Step 4 visit', title: 'Step 4 visit' }) });
      list.push({ label: '🖨 Print Letter 2 (bring it)', onClick: () => printLetters(2, [{ business: b, owner }], ctx.profile) });
    } else if (s === 'letter2') {
      list.push({ label: '🖨 Print Letter 2 (mailed version)', onClick: () => printLetters(2, [{ business: b, owner }], ctx.profile, true) });
      list.push({ label: '✉️ Log Letter 2 left or mailed', primary: true, onClick: () => setLog({ kind: 'letter', campaign: 'Letter 2', outcome: 'Sent', title: 'Letter 2' }) });
      list.push({ label: '🚪 Log another visit', onClick: () => setLog({ kind: 'door_knock', campaign: 'Step 4 visit', title: 'Step 4 visit' }) });
    }
    return list;
  }

  const scriptFor = (kind: ActivityKind) => {
    const all = STEP_CONTENT[step]?.blocks ?? [];
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
    <div className="pb-tab">
      <div className="row between top">
        <div className="grow">
          <h2 style={{ margin: '0 0 6px' }}>{info.n ? `Step ${info.n} of 5: ` : ''}{info.title}</h2>
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
        <div className="alert warn small" style={{ marginTop: 14 }}>Add your details so scripts and letters fill in: <Link to="/playbook#details">{missing.join(', ')}</Link></div>
      )}
      {step === 'conversation' && <div className="alert ok small" style={{ marginTop: 14 }}>You've reached the owner, so the outreach sequence is done. The first-meeting guide is open below.</div>}
      {step === 'done' && <div className="alert info small" style={{ marginTop: 14 }}>All five steps are done for this store. {b.next_action_note ? `Next: ${b.next_action_note}.` : ''} Use the menu above to restart a step.</div>}

      <label className="field" style={{ marginTop: 14 }}>
        <span>Best time to catch the owner</span>
        <input value={bestTime} onChange={(e) => setBestTime(e.target.value)} onBlur={() => bestTime !== (b.best_time ?? '') && saveBusinesses([{ ...b, best_time: bestTime || null }])}
          placeholder="e.g. Weekday mornings around 9; collects Tuesdays" />
      </label>

      <div className="pb-outline">
        {SEQUENCE.map((s, i) => {
          const si = STEP_INFO[s];
          const content = STEP_CONTENT[s]!;
          const isCurrent = s === step;
          const isPast = finished || (currentIdx >= 0 && i < currentIdx);
          const actions = isCurrent ? actionsFor(s) : [];
          return (
            <details key={s} className={`pb-item ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}`} open={isCurrent}>
              <summary>
                <span className="pb-item-n">{isPast ? '✓' : si.n}</span>
                <span className="grow">
                  <span className="pb-item-t">{si.title}</span>
                  <span className="pb-item-w">{isCurrent ? 'Current step' : isPast ? 'Done' : si.when}</span>
                </span>
                <span className="pb-chev" aria-hidden="true">›</span>
              </summary>
              <div className="pb-item-body">
                <p>{content.goal}</p>
                {isCurrent && s === 'find_owner' && owner && isCompanyName(owner.name) && (
                  <div className="alert warn small">The owner on file is a company (<strong>{owner.name}</strong>). Letter 1 will open with "Hello," unless you find the person behind it. bizfile Online lists an LLC's managers or officers. <button className="btn sm" onClick={() => move('letter1')}>Use "Hello," → Letter 1</button></div>
                )}
                {isCurrent && s === 'find_owner' && owner && !isCompanyName(owner.name) && (
                  <div className="alert ok small">You already have a name: <strong>{owner.name}</strong>. If it's confirmed, move on. <button className="btn sm" onClick={() => move('letter1')}>Name confirmed → Letter 1</button></div>
                )}
                {isCurrent && s === 'find_owner' && !owner && <p className="small muted">Got a name? Pick <strong>Got owner name</strong> when you log the call and type it in. This moves to Letter 1 automatically.</p>}
                {isCurrent && (
                  <div className="row" style={{ margin: '4px 0 14px' }}>
                    {actions.map((a) => a.href
                      ? <a key={a.label} className={`btn ${a.primary ? 'primary' : ''}`} href={a.href} onClick={a.onClick}>{a.label}</a>
                      : <button key={a.label} className={`btn ${a.primary ? 'primary' : ''}`} onClick={a.onClick}>{a.label}</button>)}
                    {s !== 'scout' && <button className="btn sm" onClick={() => move(nextInSequence())}>Mark step done</button>}
                  </div>
                )}
                {!isCurrent && <div style={{ marginBottom: 10 }}><button className="btn sm" onClick={() => move(s)}>Move to this step</button></div>}
                <PlaybookBlocks blocks={content.blocks} ctx={ctx} />
              </div>
            </details>
          );
        })}

        <details className="pb-item extra" open={step === 'conversation' || b.stage === 'conversation'}>
          <summary><span className="pb-item-n">☕</span><span className="grow"><span className="pb-item-t">First-meeting guide</span><span className="pb-item-w">When the owner agrees to coffee</span></span><span className="pb-chev">›</span></summary>
          <div className="pb-item-body"><PlaybookBlocks blocks={FIRST_MEETING} ctx={ctx} /></div>
        </details>
        <details className="pb-item extra" open={b.stage === 'nda' || b.stage === 'financials'}>
          <summary><span className="pb-item-n">📄</span><span className="grow"><span className="pb-item-t">Documents to request after the NDA</span><span className="pb-item-w">P&amp;Ls, utility bills, lease, equipment</span></span><span className="pb-chev">›</span></summary>
          <div className="pb-item-body"><PlaybookBlocks blocks={NDA_DOCS} ctx={ctx} /></div>
        </details>
        <details className="pb-item extra">
          <summary><span className="pb-item-n">?</span><span className="grow"><span className="pb-item-t">Tough questions</span><span className="pb-item-w">"Are you a broker?" "What would you pay?"…</span></span><span className="pb-chev">›</span></summary>
          <div className="pb-item-body"><PlaybookBlocks blocks={TOUGH_QUESTIONS} ctx={ctx} /></div>
        </details>
      </div>

      {log && (
        <Modal title={`${log.title} — ${b.name}`} onClose={() => setLog(null)}>
          <ActivityLogger businessIds={[b.id]} defaultKind={log.kind} defaultCampaign={log.campaign} defaultOutcome={log.outcome} aside={scriptFor(log.kind)} onDone={() => setLog(null)} />
        </Modal>
      )}
    </div>
  );
}
