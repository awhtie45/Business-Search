import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { STAGES, type Business } from '../lib/types';
import { fullAddress } from '../lib/util';
import { MapView, LANDMARK_COLOR } from '../components/MapView';
import { StageBadge } from '../components/ui';

export function MapPage() {
  const { businesses, types, geocoding, settings } = useStore();
  const [type, setType] = useState('');
  const [showRuledOut, setShowRuledOut] = useState(false);
  const [picked, setPicked] = useState<Business | null>(null);
  const list = businesses.filter((b) => (showRuledOut || !b.ruled_out) && (!type || b.type_id === type));
  const missing = list.filter((b) => b.lat == null).length;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Map</h1>
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={showRuledOut} onChange={(e) => setShowRuledOut(e.target.checked)} /> Show ruled out</label>
        </div>
      </div>
      <div className="legend" style={{ marginBottom: 8 }}>
        {STAGES.map((s) => <span key={s.key}><span className="dot" style={{ background: s.color }} />{s.label}</span>)}
        {showRuledOut && <span><span className="dot" style={{ background: '#9aa4b1' }} />Ruled out</span>}
        {(settings.landmarks ?? []).map((l) => <span key={l.id}><span className="dot" style={{ background: LANDMARK_COLOR, width: 12, height: 12 }} />{l.label}</span>)}
        <Link to="/settings#landmarks" className="small">Edit landmarks</Link>
      </div>
      {missing > 0 && (
        <div className="alert info small">
          {missing} business{missing === 1 ? '' : 'es'} not on the map yet{geocoding.running ? ' — looking up addresses…' : '.'} <Link to="/businesses?contact=nomap">See which</Link>
        </div>
      )}
      <MapView businesses={list} className="map tall" onSelect={setPicked} fitLandmarks />
      {picked && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row between">
            <div>
              <strong>{picked.name}</strong> <StageBadge b={picked} />
              <div className="small muted">{fullAddress(picked)}</div>
            </div>
            <Link className="btn primary" to={`/businesses/${picked.id}`}>Open</Link>
          </div>
        </div>
      )}
    </div>
  );
}
