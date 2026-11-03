import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore, useLookups } from '../lib/store';
import { STAGES, kindInfo, type PlaybookStep } from '../lib/types';
import { STEP_INFO, missingProfile } from '../lib/playbook';
import { addDaysISO, daysSince, fmtDate, fmtDateTime, fullAddress, todayISO } from '../lib/util';
import { Empty, StageBadge } from '../components/ui';

export function Today() {
  const { businesses, activities, routes, backend } = useStore();
  const { typeById } = useLookups();
  const today = todayISO();
  const weekAhead = addDaysISO(7);

  const active = businesses.filter((b) => !b.ruled_out);
  const due = active.filter((b) => b.next_action_date && b.next_action_date <= today).sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!));
  const upcoming = active.filter((b) => b.next_action_date && b.next_action_date > today && b.next_action_date <= weekAhead).sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!));
  const revisit = businesses.filter((b) => b.ruled_out && b.revisit_date && b.revisit_date <= today);
  const neverContacted = active.filter((b) => !b.last_activity_at).length;

  const stats = useMemo(() => {
    const touches7 = activities.filter((a) => a.kind !== 'note' && (daysSince(a.occurred_at) ?? 99) < 7);
    const touches30 = activities.filter((a) => a.kind !== 'note' && (daysSince(a.occurred_at) ?? 99) < 30);
    const byKind = new Map<string, number>();
    for (const a of touches30) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
    return { touches7: touches7.length, touches30: touches30.length, byKind };
  }, [activities]);

  const byStage = STAGES.map((s) => ({ ...s, count: active.filter((b) => b.stage === s.key).length }));
  const maxStage = Math.max(1, ...byStage.map((s) => s.count));
  const recent = [...activities].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 8);
  const bizById = new Map(businesses.map((b) => [b.id, b]));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (businesses.length === 0) {
    return (
      <div>
        <div className="page-head"><div><h1>Welcome 👋</h1><div className="page-sub">Let's set up your business search.</div></div></div>
        <GettingStarted />
        {backend.mode === 'local' && (
          <p className="small muted">Your data is saved in this browser only. Use Settings → Download backup now and then.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{greeting}</h1>
          <div className="page-sub">
            {due.length ? `You have ${due.length} follow-up${due.length === 1 ? '' : 's'} due.` : 'No follow-ups due today.'} {neverContacted > 0 && `${neverContacted} ${neverContacted === 1 ? "business hasn't" : "businesses haven't"} been contacted yet.`}
          </div>
        </div>
        <div className="row">
          <Link className="btn" to="/import">Import</Link>
          <Link className="btn primary" to="/businesses/new">+ Add business</Link>
        </div>
      </div>
      <GettingStarted />
      <PlaybookSummary />
      <div className="grid stats" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="num">{due.length}</div><div className="lbl">Follow-ups due</div></div>
        <div className="stat"><div className="num">{stats.touches7}</div><div className="lbl">Touches this week</div></div>
        <div className="stat"><div className="num">{stats.touches30}</div><div className="lbl">Touches, last 30 days</div></div>
        <div className="stat"><div className="num">{neverContacted}</div><div className="lbl">Never contacted</div></div>
        <div className="stat"><div className="num">{active.length}</div><div className="lbl">Active businesses</div></div>
      </div>

      <div className="grid two">
        <div className="card tight">
          <div style={{ padding: '14px 14px 4px' }}><h2>Due now {due.length > 0 && <span className="badge danger">{due.length}</span>}</h2></div>
          {due.length === 0 ? <Empty>Nothing due. Nice.</Empty> : due.map((b) => (
            <Link key={b.id} to={`/businesses/${b.id}`} className="list-item">
              <div className="row between">
                <strong>{b.name}</strong>
                <span className={`badge ${b.next_action_date! < today ? 'danger' : 'warn'}`}>{b.next_action_date! < today ? `Overdue · ${fmtDate(b.next_action_date)}` : 'Today'}</span>
              </div>
              <div className="small muted">{b.next_action_note || fullAddress(b)}</div>
            </Link>
          ))}
          {upcoming.length > 0 && (
            <>
              <div style={{ padding: '12px 14px 4px' }}><h3 className="muted">Next 7 days</h3></div>
              {upcoming.map((b) => (
                <Link key={b.id} to={`/businesses/${b.id}`} className="list-item">
                  <div className="row between"><span>{b.name}</span><span className="small muted">{fmtDate(b.next_action_date)}</span></div>
                  {b.next_action_note && <div className="small muted">{b.next_action_note}</div>}
                </Link>
              ))}
            </>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Pipeline</h2>
            {byStage.map((s) => (
              <Link key={s.key} to={`/businesses?stage=${s.key}`} className="row" style={{ marginBottom: 6, color: 'inherit' }}>
                <span style={{ width: 140 }} className="small">{s.label}</span>
                <div className="grow" style={{ background: '#eef1f5', borderRadius: 6, height: 18 }}>
                  <div style={{ width: `${(s.count / maxStage) * 100}%`, background: s.color, height: '100%', borderRadius: 6, minWidth: s.count ? 4 : 0 }} />
                </div>
                <span style={{ width: 32, textAlign: 'right' }}>{s.count}</span>
              </Link>
            ))}
            {stats.byKind.size > 0 && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Last 30 days: {[...stats.byKind].map(([k, n]) => `${kindInfo(k).icon} ${n} ${kindInfo(k).label.toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}
              </p>
            )}
          </div>

          {revisit.length > 0 && (
            <div className="card tight">
              <div style={{ padding: '14px 14px 4px' }}><h2>Time to revisit</h2><p className="small muted">Ruled out earlier, but you asked to look again.</p></div>
              {revisit.map((b) => (
                <Link key={b.id} to={`/businesses/${b.id}`} className="list-item">
                  <strong>{b.name}</strong> <span className="small muted">— {b.rule_out_reason}</span>
                </Link>
              ))}
            </div>
          )}

          {routes.length > 0 && (
            <div className="card tight">
              <div style={{ padding: '14px 14px 4px' }}><h2>Recent routes</h2></div>
              {routes.slice(0, 3).map((r) => (
                <Link key={r.id} to={`/routes/${r.id}`} className="list-item">
                  <div className="row between"><span>{r.name}</span><span className="small muted">{r.stops.filter((s) => s.done).length}/{r.stops.length} done</span></div>
                </Link>
              ))}
            </div>
          )}

          <div className="card tight">
            <div style={{ padding: '14px 14px 4px' }}><h2>Recent activity</h2></div>
            {recent.length === 0 ? <Empty>No activity yet.</Empty> : recent.map((a) => {
              const b = bizById.get(a.business_id);
              return (
                <Link key={a.id} to={`/businesses/${a.business_id}`} className="list-item">
                  <div className="row between">
                    <span>{kindInfo(a.kind).icon} {b?.name ?? 'Deleted'}</span>
                    <span className="small muted">{fmtDateTime(a.occurred_at)}</span>
                  </div>
                  <div className="small muted">{[a.outcome, a.notes].filter(Boolean).join(' — ')}</div>
                  {b && <div style={{ marginTop: 4 }}><StageBadge b={b} /> <span className="small muted">{typeById.get(b.type_id ?? '')?.name}</span></div>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Checklist in the spirit of an onboarding guide; ticks itself off as you use the app. */
function GettingStarted() {
  const { businesses, owners, activities, routes } = useStore();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('bizsearch:ui:hideStart') === '1'; } catch { return false; }
  });
  const steps = [
    { done: businesses.length > 0, title: 'Add your first businesses', text: 'Import a list from Excel, a Google Sheet, or paste one from ChatGPT or Claude.', to: '/import', cta: 'Import a list' },
    { done: owners.length > 0, title: 'Add owner names', text: 'Linking owners means one conversation covers all their locations.', to: '/owners', cta: 'Add owners' },
    { done: activities.length > 0, title: 'Log your first outreach', text: 'Record a call, postcard, letter or door knock and how it went.', to: '/businesses', cta: 'Open businesses' },
    { done: businesses.some((b) => b.next_action_date), title: 'Schedule a follow-up', text: 'Follow-ups land on this page the day they are due.', to: '/businesses', cta: 'Pick a business' },
    { done: businesses.some((b) => b.ruled_out), title: "Rule out one that's not a fit", text: 'Keeps it off your list and out of future imports, without deleting it.', to: '/businesses', cta: 'Review list' },
    { done: routes.length > 0, title: 'Plan a door-knock route', text: 'Pick a start, an end and how many stops. Optional for now.', to: '/routes', cta: 'Plan a route' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  if (hidden || doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <div className="grid onboarding" style={{ marginBottom: 20 }}>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>🔥 Your setup progress</h2>
          <button className="btn sm" onClick={() => { setHidden(true); try { localStorage.setItem('bizsearch:ui:hideStart', '1'); } catch { /* ignore */ } }}>Hide</button>
        </div>
        <div className="row" style={{ marginTop: 14, flexWrap: 'nowrap' }}>
          <div className="progress grow"><div style={{ width: `${Math.max(pct, 4)}%` }} /></div>
          <strong style={{ minWidth: 44, textAlign: 'right' }}>{pct}%</strong>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 0 }}>
        <h2>Recommended: everything you need to get started</h2>
        {steps.map((s) => (
          <div key={s.title} className={`step ${s.done ? 'done' : ''}`}>
            <span className="step-check">{s.done ? '✓' : ''}</span>
            <div className="grow">
              <Link to={s.to} className="step-title">{s.title}</Link>
              <div className="small muted">{s.text}</div>
            </div>
            {s === next && <Link className="btn primary" to={s.to}>{s.cta} ›</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Playbook: 18 need owner names · 22 ready for Letter 1 · 6 visits due" */
function PlaybookSummary() {
  const { businesses, settings } = useStore();
  const on = businesses.filter((b) => b.playbook_step && !b.ruled_out);
  if (!on.length) return null;
  const today = todayISO();
  const count = (s: PlaybookStep) => on.filter((b) => b.playbook_step === s).length;
  const visitsDue = on.filter((b) => (b.playbook_step === 'visit' || b.playbook_step === 'letter2') && b.next_action_date && b.next_action_date <= today).length;
  const tiles: { step: PlaybookStep; n: number; label: string; due?: string; hot?: boolean }[] = [
    { step: 'find_owner', n: count('find_owner'), label: 'need an owner name', due: STEP_INFO.find_owner.target },
    { step: 'scout', n: count('scout'), label: 'to scout (optional)' },
    { step: 'letter1', n: count('letter1'), label: 'ready for Letter 1', due: STEP_INFO.letter1.target },
    { step: 'visit', n: count('visit'), label: visitsDue ? `waiting for a visit · ${visitsDue} due now` : 'waiting for a visit', hot: visitsDue > 0 },
    { step: 'letter2', n: count('letter2'), label: 'need Letter 2' },
    { step: 'conversation', n: count('conversation'), label: 'talking with you' },
  ];
  const missing = missingProfile(settings.profile);
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>Outreach playbook</h2>
        <Link to="/playbook" className="btn sm">Open playbook</Link>
      </div>
      {missing.length > 0 && <div className="alert warn small" style={{ marginTop: 12, marginBottom: 0 }}>Add your details so letters and scripts fill in. <Link to="/playbook#details">Add them →</Link></div>}
      <div className="grid stats" style={{ marginTop: 14 }}>
        {tiles.map((t) => (
          <Link key={t.step} to={`/playbook?step=${t.step}`} className="stat" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="num">{t.n}</div>
            <div className="lbl" style={t.hot ? { color: 'var(--danger)', fontWeight: 500 } : undefined}>
              {STEP_INFO[t.step].n ? `Step ${STEP_INFO[t.step].n} · ` : ''}{t.label}
            </div>
            {t.due && t.n > 0 && <div className={`small ${t.due < today ? 'pb-overdue' : 'muted'}`} style={{ marginTop: 2 }}>by {fmtDate(t.due)}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
