import { useState, type ReactNode } from 'react';
import { ACTIVITY_KINDS, OUTCOMES, type Activity, type ActivityKind } from '../lib/types';
import { useStore } from '../lib/store';
import { addDaysISO, uid, nowISO } from '../lib/util';
import { Field } from './ui';

const FOLLOW_UPS = [
  { label: 'No change', days: undefined },
  { label: 'None', days: null },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
] as const;

function localInputValue(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Logs one activity against one or many businesses (e.g. a postcard campaign). */
export function ActivityLogger({ businessIds, defaultKind = 'call', onDone, kinds, defaultCampaign = '', defaultOutcome = '', aside }: {
  businessIds: string[];
  defaultKind?: ActivityKind;
  onDone?: () => void;
  kinds?: ActivityKind[];
  defaultCampaign?: string;
  defaultOutcome?: string;
  /** Shown above the form, e.g. the playbook script for this step. */
  aside?: ReactNode;
}) {
  const { logActivities, toast, businesses, owners, saveOwners, saveBusinesses } = useStore();
  const single = businessIds.length === 1 ? businesses.find((b) => b.id === businessIds[0]) : undefined;
  const hasOwner = !!single?.owner_id && owners.some((o) => o.id === single.owner_id);
  const [ownerName, setOwnerName] = useState('');
  const [bestTime, setBestTime] = useState(single?.best_time ?? '');
  const [kind, setKind] = useState<ActivityKind>(defaultKind);
  const [outcome, setOutcome] = useState(defaultOutcome);
  const [notes, setNotes] = useState('');
  const [campaign, setCampaign] = useState(defaultCampaign);
  const [when, setWhen] = useState(localInputValue());
  const [follow, setFollow] = useState<number | null | undefined | 'custom'>(undefined);
  const [customDate, setCustomDate] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [busy, setBusy] = useState(false);
  const many = businessIds.length > 1;
  const kindList = ACTIVITY_KINDS.filter((k) => !kinds || kinds.includes(k.key));

  async function submit() {
    setBusy(true);
    const occurred = new Date(when).toISOString();
    const rows: Activity[] = businessIds.map((id) => ({
      id: uid(), business_id: id, kind, outcome: outcome || null, notes: notes.trim() || null,
      campaign: campaign.trim() || null, occurred_at: occurred, created_at: nowISO(),
    }));
    // Capture what the playbook says to write down after each call or visit.
    if (single && (kind === 'call' || kind === 'door_knock')) {
      let latest = single;
      if (!hasOwner && ownerName.trim()) {
        const ts = nowISO();
        const o = { id: uid(), name: ownerName.trim(), do_not_contact: false, created_at: ts, updated_at: ts };
        await saveOwners([o]);
        latest = { ...latest, owner_id: o.id };
      }
      if ((bestTime || '') !== (single.best_time ?? '')) latest = { ...latest, best_time: bestTime.trim() || null };
      if (latest !== single) await saveBusinesses([latest]);
    }
    const nextActionDate = follow === undefined ? undefined : follow === null ? null : follow === 'custom' ? customDate || null : addDaysISO(follow);
    try {
      await logActivities(rows, nextActionDate === undefined ? undefined : { nextActionDate, nextActionNote: followNote.trim() || null });
      toast(many ? `Logged ${kind.replace('_', ' ')} for ${rows.length} businesses` : 'Activity logged');
      setOutcome('');
      setNotes('');
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {aside}
      <div className="chips">
        {kindList.map((k) => (
          <button key={k.key} type="button" className={`chip big ${kind === k.key ? 'on' : ''}`} onClick={() => { setKind(k.key); setOutcome(''); }}>
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      {OUTCOMES[kind].length > 0 && (
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>Outcome</div>
          <div className="chips">
            {OUTCOMES[kind].map((o) => (
              <button key={o} type="button" className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(outcome === o ? '' : o)}>{o}</button>
            ))}
          </div>
        </div>
      )}
      {single && (kind === 'call' || kind === 'door_knock') && (
        <div className="grid form">
          {!hasOwner && (
            <Field label="Owner's name (if you learned it)">
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="First and last name, spelled right" />
            </Field>
          )}
          <Field label="Best time to catch the owner">
            <input value={bestTime} onChange={(e) => setBestTime(e.target.value)} placeholder="e.g. Weekday mornings" />
          </Field>
        </div>
      )}
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened? Who did you talk to?" />
      </Field>
      <div className="grid form">
        <Field label="When">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        {(kind === 'postcard' || kind === 'letter' || kind === 'email' || many) && (
          <Field label="Campaign name (optional)">
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Spring postcard #1" />
          </Field>
        )}
      </div>
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>Next follow-up</div>
        <div className="chips">
          {FOLLOW_UPS.map((f) => (
            <button key={f.label} type="button" className={`chip ${follow === f.days ? 'on' : ''}`} onClick={() => setFollow(f.days)}>{f.label}</button>
          ))}
          <button type="button" className={`chip ${follow === 'custom' ? 'on' : ''}`} onClick={() => setFollow('custom')}>Pick date</button>
        </div>
        {follow === 'custom' && <input type="date" style={{ marginTop: 8 }} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />}
        {follow !== undefined && follow !== null && (
          <input style={{ marginTop: 8 }} value={followNote} onChange={(e) => setFollowNote(e.target.value)} placeholder="Follow-up note, e.g. call owner Tuesday morning" />
        )}
      </div>
      <button className="btn primary lg block" disabled={busy || !businessIds.length} onClick={submit}>
        {busy ? 'Saving…' : many ? `Log for ${businessIds.length} businesses` : 'Log activity'}
      </button>
    </div>
  );
}
