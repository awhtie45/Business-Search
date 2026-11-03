import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { STAGES } from '../lib/types';
import { geocode, type LatLng } from '../lib/geo';
import { buildContext, googleMapsLegs, ineligibleReason, planRoute, MAX_ORS_JOBS, type PlannedRoute } from '../lib/routing';
import { fmtDate, fmtDuration, fmtMiles, fullAddress, nowISO, uid } from '../lib/util';
import { MapView, type NumberedPoint } from '../components/MapView';
import { Field } from '../components/ui';

interface Endpoint extends LatLng { label: string }

export function RoutePlanner() {
  const { businesses, activities, owners, types, settings, routes, saveRoute, saveSettings, toast } = useStore();
  const navigate = useNavigate();
  const [startText, setStartText] = useState(settings.default_start ?? '');
  const [endText, setEndText] = useState(settings.default_end ?? '');
  const [roundTrip, setRoundTrip] = useState(!settings.default_end);
  const [stops, setStops] = useState(10);
  const [minutesPerStop, setMinutesPerStop] = useState(10);
  const [typeIds, setTypeIds] = useState<string[]>(types.length === 1 ? [types[0].id] : []);
  const [stages, setStages] = useState<string[]>(['prospect', 'contacted']);
  const [includeContacted, setIncludeContacted] = useState(true);
  const [cooldown, setCooldown] = useState(settings.knock_cooldown_days ?? 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<(PlannedRoute & { start: Endpoint; end: Endpoint }) | null>(null);
  const [name, setName] = useState('');

  const ctx = useMemo(() => buildContext(activities, owners), [activities, owners]);
  const [onlyVisits, setOnlyVisits] = useState(new URLSearchParams(window.location.search).get('playbook') === 'visit');
  const opts = { typeIds, stages: onlyVisits ? [] : stages, cooldownDays: cooldown, includeContacted: onlyVisits || includeContacted, playbookSteps: onlyVisits ? ['visit', 'letter2'] : [] };
  const eligible = businesses.filter((b) => !ineligibleReason(b, opts, ctx));
  const noLocation = businesses.filter((b) => !b.ruled_out && b.lat == null).length;

  function useMyLocation() {
    if (!navigator.geolocation) return setError('This browser cannot share location.');
    navigator.geolocation.getCurrentPosition(
      (p) => setStartText(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
      () => setError('Could not get your location. Check location permission for this site.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function resolve(text: string, what: string): Promise<Endpoint> {
    const r = await geocode(text, settings.ors_api_key);
    if (!r) throw new Error(`Couldn't find the ${what} address "${text}". Try adding city and state.`);
    return r;
  }

  async function generate() {
    setError('');
    setBusy(true);
    try {
      if (!startText.trim()) throw new Error('Enter a starting location.');
      const start = await resolve(startText, 'starting');
      const end = roundTrip || !endText.trim() ? start : await resolve(endText, 'ending');
      if (eligible.length === 0) throw new Error('No businesses match these filters. Loosen the filters or check that businesses have map locations.');
      const res = await planRoute({ start, end, pool: eligible, stops, orsKey: settings.ors_api_key, minutesPerStop });
      setPlan({ ...res, start, end });
      setName(`Knock route · ${fmtDate(new Date().toISOString())}`);
      if (startText !== settings.default_start || (roundTrip ? '' : endText) !== (settings.default_end ?? '')) {
        saveSettings({ ...settings, default_start: startText, default_end: roundTrip ? null : endText }).catch(() => undefined);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!plan) return;
    const id = uid();
    await saveRoute({
      id, name: name || 'Route', start_label: plan.start.label, start_lat: plan.start.lat, start_lng: plan.start.lng,
      end_label: plan.end.label, end_lat: plan.end.lat, end_lng: plan.end.lng,
      stops: plan.stops.map((b) => ({ business_id: b.id, done: false })),
      distance_m: plan.distance_m, duration_s: plan.duration_s, geometry: plan.geometry, created_at: nowISO(),
    });
    toast('Route saved — open it on your phone to start knocking');
    navigate(`/routes/${id}`);
  }

  function removeStop(id: string) {
    if (plan) setPlan({ ...plan, stops: plan.stops.filter((s) => s.id !== id), geometry: null });
  }

  const numbered: NumberedPoint[] = plan
    ? [
        { lat: plan.start.lat, lng: plan.start.lng, label: 'S', title: `Start: ${plan.start.label}`, endpoint: true },
        ...plan.stops.map((b, i) => ({ lat: b.lat!, lng: b.lng!, label: String(i + 1), title: b.name, businessId: b.id })),
        ...(plan.end.lat !== plan.start.lat || plan.end.lng !== plan.start.lng ? [{ lat: plan.end.lat, lng: plan.end.lng, label: 'E', title: `End: ${plan.end.label}`, endpoint: true }] : []),
      ]
    : [];
  const totalTime = plan?.duration_s != null ? plan.duration_s + plan.stops.length * minutesPerStop * 60 : null;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div>
      <h1>Plan a door-knock route</h1>
      {error && <div className="alert error">{error}</div>}
      {!settings.ors_api_key && (
        <div className="alert info small">Routes are estimated by straight-line distance. For real driving routes and drive times, add a free OpenRouteService key in <Link to="/settings">Settings</Link>.</div>
      )}
      <div className="grid two">
        <div className="card stack">
          <Field label="Start">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input value={startText} onChange={(e) => setStartText(e.target.value)} placeholder="Address, or lat, lng" />
              <button className="btn" onClick={useMyLocation} title="Use my current location">📍</button>
            </div>
          </Field>
          <label className="check"><input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} /> End where I start</label>
          {!roundTrip && <Field label="End"><input value={endText} onChange={(e) => setEndText(e.target.value)} placeholder="Address, or lat, lng" /></Field>}
          <div className="grid form">
            <Field label={`Number of stops (max 25)`}>
              <input type="number" min={1} max={25} value={stops} onChange={(e) => setStops(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Minutes at each stop">
              <input type="number" min={0} max={120} value={minutesPerStop} onChange={(e) => setMinutesPerStop(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
        </div>

        <div className="card stack">
          <h3>Which businesses?</h3>
          {types.length > 1 && (
            <div className="chips">
              {types.map((t) => <button key={t.id} className={`chip ${typeIds.includes(t.id) ? 'on' : ''}`} onClick={() => setTypeIds(toggle(typeIds, t.id))}>{t.name}</button>)}
              <span className="small muted" style={{ alignSelf: 'center' }}>{typeIds.length ? '' : '(all types)'}</span>
            </div>
          )}
          <div className="chips">
            {STAGES.filter((s) => s.key !== 'closed').map((s) => <button key={s.key} className={`chip ${stages.includes(s.key) ? 'on' : ''}`} onClick={() => setStages(toggle(stages, s.key))}>{s.label}</button>)}
          </div>
          <label className="check"><input type="checkbox" checked={onlyVisits} onChange={(e) => setOnlyVisits(e.target.checked)} /> Only playbook Step 4 visits (stores waiting for you to stop in)</label>
          <label className="check"><input type="checkbox" checked={includeContacted} onChange={(e) => setIncludeContacted(e.target.checked)} /> Include businesses I've already called/mailed</label>
          <Field label="Skip anything I knocked on in the last … days">
            <input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <p className="small muted">
            <strong>{eligible.length}</strong> businesses can go on this route.
            {noLocation > 0 && <> {noLocation} have no map location yet (<Link to="/businesses?contact=nomap">fix</Link>).</>}
            {settings.ors_api_key && eligible.length > MAX_ORS_JOBS && <> The {MAX_ORS_JOBS} most on-the-way are sent to the optimizer.</>}
          </p>
          <button className="btn primary lg block" disabled={busy} onClick={generate}>{busy ? 'Building route…' : 'Build route'}</button>
        </div>
      </div>

      {plan && (
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{plan.stops.length} stops</h2>
            <span className="muted small">
              {fmtMiles(plan.distance_m)} · {fmtDuration(plan.duration_s)} driving{totalTime != null ? ` · ~${fmtDuration(totalTime)} total` : ''}
              {plan.method === 'estimate' ? ' (estimated)' : ''}
            </span>
          </div>
          {plan.warning && <div className="alert warn small" style={{ marginTop: 8 }}>{plan.warning}</div>}
          {plan.stops.length < stops && <div className="alert info small" style={{ marginTop: 8 }}>Only {plan.stops.length} businesses matched, so the route is shorter than you asked for.</div>}
          <div className="grid two" style={{ marginTop: 10 }}>
            <MapView numbered={numbered} line={plan.geometry} className="map" />
            <div>
              <ol style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                <li className="row small muted" style={{ padding: '6px 0' }}><span className="stopnum" style={{ background: '#111827' }}>S</span>{plan.start.label}</li>
                {plan.stops.map((b, i) => (
                  <li key={b.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'nowrap' }}>
                    <span className="stopnum">{i + 1}</span>
                    <div className="grow">
                      <Link to={`/businesses/${b.id}`}><strong>{b.name}</strong></Link>
                      <div className="small muted">{fullAddress(b)}{b.hours ? ` · ${b.hours}` : ''}</div>
                    </div>
                    <button className="btn sm" title="Remove from route" onClick={() => removeStop(b.id)}>✕</button>
                  </li>
                ))}
                <li className="row small muted" style={{ padding: '6px 0' }}><span className="stopnum" style={{ background: '#111827' }}>E</span>{plan.end.label}</li>
              </ol>
              <div className="stack" style={{ marginTop: 12 }}>
                <Field label="Route name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <div className="row">
                  <button className="btn primary" onClick={save}>Save & start</button>
                  {googleMapsLegs(plan.start, plan.end, plan.stops.map((b) => ({ lat: b.lat!, lng: b.lng! }))).map((u, i, arr) => (
                    <a key={u} className="btn" href={u} target="_blank" rel="noreferrer">Google Maps{arr.length > 1 ? ` (part ${i + 1})` : ''}</a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {routes.length > 0 && (
        <div className="card tight">
          <div style={{ padding: '14px 14px 4px' }}><h2>Saved routes</h2></div>
          {routes.map((r) => (
            <Link key={r.id} to={`/routes/${r.id}`} className="list-item">
              <div className="row between">
                <strong>{r.name}</strong>
                <span className="small muted">{r.stops.filter((s) => s.done).length}/{r.stops.length} done · {fmtDate(r.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
