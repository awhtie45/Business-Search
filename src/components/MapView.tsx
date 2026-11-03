import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import type { Business } from '../lib/types';
import { kindInfo, stageInfo } from '../lib/types';
import { fmtDate, fullAddress, todayISO } from '../lib/util';
import { useLookups, useStore } from '../lib/store';
import { STEP_INFO } from '../lib/playbook';

export interface NumberedPoint {
  lat: number;
  lng: number;
  label: string;
  title: string;
  done?: boolean;
  endpoint?: boolean;
  businessId?: string;
}

export const LANDMARK_COLOR = '#ff1a1a';

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const numIcon = (p: NumberedPoint) =>
  L.divIcon({ className: '', html: `<div class="numpin${p.done ? ' done' : ''}${p.endpoint ? ' endpoint' : ''}">${p.label}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });

/** The hover card for a business pin. */
function BusinessPreview({ b }: { b: Business }) {
  const { ownerById, activitiesByBiz, typeById } = useLookups();
  const owner = b.owner_id ? ownerById.get(b.owner_id) : undefined;
  const acts = activitiesByBiz.get(b.id) ?? [];
  const last = acts[0];
  const stage = stageInfo(b.stage);
  const overdue = b.next_action_date && b.next_action_date <= todayISO();
  return (
    <div className="map-preview">
      <div className="mp-title">{b.name}</div>
      <div className="mp-badges">
        {b.ruled_out ? <span className="badge out">Ruled out</span> : <span className="badge" style={{ background: stage.color }}>{stage.label}</span>}
        {typeById.get(b.type_id ?? '') && <span className="badge soft">{typeById.get(b.type_id ?? '')!.name}</span>}
      </div>
      <div className="mp-line">{fullAddress(b)}</div>
      {owner && <div className="mp-line"><span className="mp-k">Owner</span> {owner.name}{owner.do_not_contact ? ' · do not contact' : ''}</div>}
      {(owner?.phone || b.phone) && <div className="mp-line"><span className="mp-k">Phone</span> {owner?.phone || b.phone}</div>}
      {b.hours && <div className="mp-line"><span className="mp-k">Hours</span> {b.hours}</div>}
      {b.best_time && <div className="mp-line"><span className="mp-k">Best time</span> {b.best_time}</div>}
      {b.playbook_step && !b.ruled_out && <div className="mp-line"><span className="mp-k">Playbook</span> {STEP_INFO[b.playbook_step].n ? `Step ${STEP_INFO[b.playbook_step].n}: ` : ''}{STEP_INFO[b.playbook_step].title}</div>}
      <div className="mp-line">
        <span className="mp-k">Last touch</span>{' '}
        {last ? `${kindInfo(last.kind).icon} ${fmtDate(last.occurred_at)}${last.outcome ? ` · ${last.outcome}` : ''}` : 'Never contacted'}
        {acts.length > 1 && <span className="muted"> ({acts.length} total)</span>}
      </div>
      {b.next_action_date && (
        <div className="mp-line" style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
          <span className="mp-k">Follow up</span> {fmtDate(b.next_action_date)}{b.next_action_note ? ` · ${b.next_action_note}` : ''}
        </div>
      )}
      {b.ruled_out && b.rule_out_reason && <div className="mp-line"><span className="mp-k">Why out</span> {b.rule_out_reason}</div>}
      {b.notes && <div className="mp-notes">{b.notes.length > 140 ? b.notes.slice(0, 140) + '…' : b.notes}</div>}
      <div className="mp-hint">Click for more</div>
    </div>
  );
}

export function MapView({ businesses = [], numbered = [], line, className = 'map', onSelect, showLandmarks = true, fitLandmarks = false }: {
  businesses?: Business[];
  numbered?: NumberedPoint[];
  line?: [number, number][] | null;
  className?: string;
  onSelect?: (b: Business) => void;
  showLandmarks?: boolean;
  /** Zoom the map so landmarks are in view too (not just the businesses). */
  fitLandmarks?: boolean;
}) {
  const { settings } = useStore();
  const landmarks = showLandmarks ? settings.landmarks ?? [] : [];
  const located = businesses.filter((b) => b.lat != null && b.lng != null);
  const points = useMemo<[number, number][]>(
    () => {
      const pts = [...located.map((b) => [b.lat!, b.lng!] as [number, number]), ...numbered.map((p) => [p.lat, p.lng] as [number, number])];
      if (fitLandmarks && pts.length) pts.push(...landmarks.map((l) => [l.lat, l.lng] as [number, number]));
      return pts;
    },
    [located, numbered, landmarks, fitLandmarks],
  );
  return (
    <div className={className}>
      <MapContainer center={[39.5, -98.35]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} />
        {line && line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2d6aa3', weight: 5, opacity: 0.75 }} />}
        {landmarks.map((l) => (
          <CircleMarker key={l.id} center={[l.lat, l.lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: LANDMARK_COLOR, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -10]}><strong>📍 {l.label}</strong></Tooltip>
          </CircleMarker>
        ))}
        {located.map((b) => {
          const color = b.ruled_out ? '#9aa4b1' : stageInfo(b.stage).color;
          return (
            <CircleMarker key={b.id} center={[b.lat!, b.lng!]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}
              eventHandlers={onSelect ? { click: () => onSelect(b) } : undefined}>
              <Tooltip direction="top" offset={[0, -8]} opacity={1} className="map-tooltip">
                <BusinessPreview b={b} />
              </Tooltip>
              {!onSelect && (
                <Popup>
                  <strong>{b.name}</strong>
                  <br />
                  {fullAddress(b)}
                  <br />
                  <Link to={`/businesses/${b.id}`}>Open →</Link>
                </Popup>
              )}
            </CircleMarker>
          );
        })}
        {numbered.map((p, i) => (
          <Marker key={`${p.label}-${i}`} position={[p.lat, p.lng]} icon={numIcon(p)}>
            <Popup>
              <strong>{p.title}</strong>
              {p.businessId && (<><br /><Link to={`/businesses/${p.businessId}`}>Open →</Link></>)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
