import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { stageInfo } from '../lib/types';
import { digitsOnly, fullAddress } from '../lib/util';
import { Icon } from './Icon';

type Hit = { key: string; title: string; sub: string; to: string; color?: string; tag: string };

/** "Find in Business Search": jump straight to a business or owner from anywhere. */
export function GlobalSearch() {
  const { businesses, owners } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    const digits = digitsOnly(n);
    const out: Hit[] = [];
    for (const b of businesses) {
      const hay = [b.name, b.address, b.city, b.zip].join(' ').toLowerCase();
      if (hay.includes(n) || (digits.length >= 4 && digitsOnly(b.phone).includes(digits))) {
        out.push({ key: b.id, title: b.name, sub: fullAddress(b), to: `/businesses/${b.id}`, color: b.ruled_out ? '#9aa4b1' : stageInfo(b.stage).color, tag: b.ruled_out ? 'Ruled out' : stageInfo(b.stage).label });
      }
      if (out.length >= 7) break;
    }
    for (const o of owners) {
      if ([o.name, o.email].join(' ').toLowerCase().includes(n) || (digits.length >= 4 && digitsOnly(o.phone).includes(digits))) {
        out.push({ key: o.id, title: o.name, sub: o.phone ?? o.email ?? '', to: `/owners?focus=${o.id}`, tag: 'Owner' });
      }
      if (out.length >= 10) break;
    }
    return out;
  }, [q, businesses, owners]);

  function go(to: string) {
    navigate(to);
    setQ('');
    setOpen(false);
    input.current?.blur();
  }

  return (
    <div className="gsearch" ref={box}>
      <input
        ref={input}
        value={q}
        placeholder="Search businesses, owners, phones…"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { if (hits[active]) go(hits[active].to); else if (q.trim()) go(`/businesses?status=all&q=${encodeURIComponent(q.trim())}`); }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }}
        aria-label="Search"
      />
      <Icon name="search" size={18} className="gsearch-icon" />
      {open && q.trim().length >= 2 && (
        <div className="gsearch-results">
          {hits.length === 0 ? <div className="gsearch-empty">No matches for “{q}”</div> : hits.map((h, i) => (
            <button key={h.key} className={`gsearch-hit ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(h.to)}>
              <span className="gsearch-dot" style={{ background: h.color ?? 'var(--brand-2)' }} />
              <span className="grow">
                <span className="gsearch-title">{h.title}</span>
                <span className="gsearch-sub">{h.sub}</span>
              </span>
              <span className="gsearch-tag">{h.tag}</span>
            </button>
          ))}
          {q.trim() && <button className="gsearch-all" onClick={() => go(`/businesses?status=all&q=${encodeURIComponent(q.trim())}`)}>See all results in Businesses →</button>}
        </div>
      )}
    </div>
  );
}
