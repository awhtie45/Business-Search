import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, useLookups } from '../lib/store';
import { OUTCOMES, kindInfo, type Activity } from '../lib/types';
import { googleMapsLegs, googleMapsTo } from '../lib/routing';
import { fmtDate, fmtDuration, fmtMiles, fullAddress, nowISO, uid } from '../lib/util';
import { MapView, type NumberedPoint } from '../components/MapView';
import { Empty, Modal, StageBadge } from '../components/ui';
import { ActivityLogger } from '../components/ActivityLogger';

export function RouteRun() {
  const { id } = useParams();
  const { routes, businesses, saveRoute, deleteRoute, logActivities, toast } = useStore();
  const { activitiesByBiz, ownerById } = useLookups();
  const navigate = useNavigate();
  const [logFor, setLogFor] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const route = routes.find((r) => r.id === id);
  if (!route) return <div className="card"><Empty>Route not found. <Link to="/routes">Back</Link></Empty></div>;

  const byId = new Map(businesses.map((b) => [b.id, b]));
  const stops = route.stops.map((s, i) => ({ ...s, n: i + 1, b: byId.get(s.business_id) })).filter((s) => s.b);
  const doneCount = stops.filter((s) => s.done).length;
  const nextStop = stops.find((s) => !s.done);
  const start = { lat: route.start_lat ?? 0, lng: route.start_lng ?? 0 };
  const end = { lat: route.end_lat ?? 0, lng: route.end_lng ?? 0 };

  async function markDone(businessId: string, done = true) {
    await saveRoute({ ...route!, stops: route!.stops.map((s) => (s.business_id === businessId ? { ...s, done } : s)) });
  }

  async function quickKnock(businessId: string, outcome: string) {
    const a: Activity = { id: uid(), business_id: businessId, kind: 'door_knock', outcome, notes: null, campaign: route!.name, occurred_at: nowISO(), created_at: nowISO() };
    await logActivities([a]);
    await markDone(businessId);
    toast(`Logged: ${outcome}`);
  }

  const numbered: NumberedPoint[] = [
    { ...start, label: 'S', title: route.start_label ?? 'Start', endpoint: true },
    ...stops.map((s) => ({ lat: s.b!.lat!, lng: s.b!.lng!, label: String(s.n), title: s.b!.name, done: s.done, businessId: s.b!.id })),
    ...(end.lat !== start.lat || end.lng !== start.lng ? [{ ...end, label: 'E', title: route.end_label ?? 'End', endpoint: true }] : []),
  ].filter((p) => p.lat != null && p.lng != null);
  const remaining = stops.filter((s) => !s.done && s.b!.lat != null);
  const legs = googleMapsLegs(start, end, remaining.map((s) => ({ lat: s.b!.lat!, lng: s.b!.lng! })));

  return (
    <div>
      <div className="small"><Link to="/routes">← Routes</Link></div>
      <div className="row between">
        <h1 style={{ marginBottom: 4 }}>{route.name}</h1>
        <button className="btn sm hide-desktop" onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'Show map'}</button>
      </div>
      <p className="muted small">
        {doneCount}/{stops.length} done · {fmtMiles(route.distance_m)} · {fmtDuration(route.duration_s)} driving
      </p>
      <div style={{ background: '#e6ebf1', height: 8, borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${stops.length ? (doneCount / stops.length) * 100 : 0}%`, height: '100%', background: 'var(--ok)', borderRadius: 4 }} />
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        {nextStop && <a className="btn primary lg" href={googleMapsTo({ lat: nextStop.b!.lat ?? 0, lng: nextStop.b!.lng ?? 0 }, fullAddress(nextStop.b!) || undefined)} target="_blank" rel="noreferrer">🧭 Navigate to stop {nextStop.n}</a>}
        {legs.map((u, i) => <a key={u} className="btn" href={u} target="_blank" rel="noreferrer">Whole route in Google Maps{legs.length > 1 ? ` (${i + 1}/${legs.length})` : ''}</a>)}
      </div>

      <div className="grid two">
        {showMap && <MapView numbered={numbered} line={route.geometry} className="map" />}
        <div className="card tight">
          {stops.map((s) => {
            const b = s.b!;
            const last = activitiesByBiz.get(b.id)?.[0];
            const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
            const isNext = nextStop?.business_id === b.id;
            return (
              <div key={b.id} className="list-item" style={{ background: isNext ? '#f2f7fd' : undefined }}>
                <div className="row top" style={{ flexWrap: 'nowrap' }}>
                  <span className={`stopnum ${s.done ? 'done' : ''}`}>{s.done ? '✓' : s.n}</span>
                  <div className="grow">
                    <div className="row between">
                      <Link to={`/businesses/${b.id}`}><strong>{b.name}</strong></Link>
                      <StageBadge b={b} />
                    </div>
                    <div className="small muted">{fullAddress(b)}</div>
                    {(b.hours || owner) && <div className="small muted">{[owner && `Owner: ${owner.name}`, b.hours].filter(Boolean).join(' · ')}</div>}
                    {last && <div className="small muted">Last: {kindInfo(last.kind).icon} {fmtDate(last.occurred_at)} {last.outcome}</div>}
                    {!s.done ? (
                      <>
                        <div className="chips" style={{ marginTop: 8 }}>
                          {OUTCOMES.door_knock.map((o) => <button key={o} className="chip" onClick={() => quickKnock(b.id, o)}>{o}</button>)}
                        </div>
                        <div className="row" style={{ marginTop: 8 }}>
                          <a className="btn sm" href={googleMapsTo({ lat: b.lat ?? 0, lng: b.lng ?? 0 }, fullAddress(b) || undefined)} target="_blank" rel="noreferrer">🧭 Navigate</a>
                          <button className="btn sm" onClick={() => setLogFor(b.id)}>Log with notes…</button>
                          <button className="btn sm" onClick={() => markDone(b.id)}>Skip</button>
                        </div>
                      </>
                    ) : (
                      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => markDone(b.id, false)}>Undo</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {stops.length === 0 && <Empty>This route has no stops left.</Empty>}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn sm danger" onClick={async () => { if (confirm('Delete this route? Logged activities are kept.')) { await deleteRoute(route.id); navigate('/routes'); } }}>Delete route</button>
      </div>

      {logFor && (
        <Modal title={`Log — ${byId.get(logFor)?.name}`} onClose={() => setLogFor(null)}>
          <ActivityLogger businessIds={[logFor]} defaultKind="door_knock" onDone={async () => { await markDone(logFor); setLogFor(null); }} />
        </Modal>
      )}
    </div>
  );
}
