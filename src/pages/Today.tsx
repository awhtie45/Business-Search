import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useStore, useLookups } from '../lib/store';
import { STAGES, kindInfo } from '../lib/types';
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

  if (businesses.length === 0) {
    return (
      <div className="card">
        <h1>Welcome 👋</h1>
        <p>Start by adding the businesses you're looking at. You can:</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn primary" to="/import">Import a list (Excel, CSV, Google Sheet, or paste from ChatGPT/Claude)</Link>
          <Link className="btn" to="/businesses/new">Add one manually</Link>
        </div>
        {backend.mode === 'local' && (
          <p className="small muted" style={{ marginTop: 14 }}>You're in local mode: data is saved in this browser only. See the README to connect a free Supabase database so your phone and laptop stay in sync.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Today</h1>
      <div className="grid stats" style={{ marginBottom: 14 }}>
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
