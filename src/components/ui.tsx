import { useEffect, type ReactNode } from 'react';
import { stageInfo, type Business } from '../lib/types';
import { useStore } from '../lib/store';
import { todayISO } from '../lib/util';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StageBadge({ b }: { b: Pick<Business, 'stage' | 'ruled_out'> }) {
  if (b.ruled_out) return <span className="badge out">Ruled out</span>;
  const s = stageInfo(b.stage);
  return <span className="badge" style={{ background: s.color }}>{s.label}</span>;
}

export function FollowUpBadge({ date }: { date?: string | null }) {
  if (!date) return null;
  const today = todayISO();
  if (date < today) return <span className="badge danger">Overdue</span>;
  if (date === today) return <span className="badge warn">Due today</span>;
  return null;
}

export function PriorityBadge({ p }: { p: number }) {
  if (p === 1) return <span className="badge warn">High priority</span>;
  if (p === 3) return <span className="badge soft">Low priority</span>;
  return null;
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
