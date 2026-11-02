import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import type { Business } from '../lib/types';
import { stageInfo } from '../lib/types';
import { fullAddress } from '../lib/util';

export interface NumberedPoint {
  lat: number;
  lng: number;
  label: string;
  title: string;
  done?: boolean;
  endpoint?: boolean;
  businessId?: string;
}

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

export function MapView({ businesses = [], numbered = [], line, className = 'map', onSelect }: {
  businesses?: Business[];
  numbered?: NumberedPoint[];
  line?: [number, number][] | null;
  className?: string;
  onSelect?: (b: Business) => void;
}) {
  const located = businesses.filter((b) => b.lat != null && b.lng != null);
  const points = useMemo<[number, number][]>(
    () => [...located.map((b) => [b.lat!, b.lng!] as [number, number]), ...numbered.map((p) => [p.lat, p.lng] as [number, number])],
    [located, numbered],
  );
  return (
    <div className={className}>
      <MapContainer center={[39.5, -98.35]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} />
        {line && line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2d6aa3', weight: 5, opacity: 0.75 }} />}
        {located.map((b) => {
          const color = b.ruled_out ? '#9aa4b1' : stageInfo(b.stage).color;
          return (
            <CircleMarker key={b.id} center={[b.lat!, b.lng!]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}
              eventHandlers={onSelect ? { click: () => onSelect(b) } : undefined}>
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
