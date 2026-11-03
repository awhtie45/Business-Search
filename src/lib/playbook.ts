import type { Activity, Business, BusinessType, Owner, PlaybookStep, Profile } from './types';
import { addDaysISO, todayISO } from './util';

/**
 * The Laundromat Outreach Playbook as data: steps, how logging activity moves a business through them,
 * and the scripts and letters (with {{tokens}} filled from your details in Settings).
 */

export const STEP_INFO: Record<PlaybookStep, { n: number | null; title: string; short: string; when?: string; target?: string }> = {
  find_owner: { n: 1, title: 'Find owner name', short: 'Owner name', when: 'Week of Nov 3', target: '2026-11-07' },
  scout: { n: 2, title: 'Scouting stop-in (optional)', short: 'Scouting', when: 'Same week, optional', target: '2026-11-07' },
  letter1: { n: 3, title: 'Mail Letter 1', short: 'Letter 1', when: 'Mail by Nov 10, so it lands before Thanksgiving week', target: '2026-11-10' },
  visit: { n: 4, title: 'Stop in to meet the owner', short: 'Visit', when: 'About two weeks after Letter 1 lands' },
  letter2: { n: 5, title: 'Leave or mail Letter 2', short: 'Letter 2', when: 'Same visit, or mail it if no one was there' },
  conversation: { n: null, title: 'Talking with the owner', short: 'Talking' },
  done: { n: null, title: 'Sequence finished', short: 'Finished' },
};
export const SEQUENCE: PlaybookStep[] = ['find_owner', 'scout', 'letter1', 'visit', 'letter2'];
export const ALL_STEPS: PlaybookStep[] = [...SEQUENCE, 'conversation', 'done'];

/** Letter 1 takes ~3 days to land; the visit is ~2 weeks after that. */
export const VISIT_DAYS_AFTER_LETTER = 17;

export function playbookAppliesTo(type: BusinessType | undefined): boolean {
  return !!type && /laundr/i.test(type.name);
}

const STAGE_ORDER = ['prospect', 'contacted', 'conversation', 'nda', 'financials', 'loi', 'diligence', 'closed'];
const atLeast = (stage: Business['stage'], min: Business['stage']) => (STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(min) ? stage : min);

function from(a: Activity, days: number) {
  return addDaysISO(days, new Date(a.occurred_at));
}

/**
 * What logging this activity means for the playbook. Returns the fields to change, or null.
 * Mirrors the playbook's rules: reaching the owner ends the sequence; "maybe" leads to Letter 1;
 * "no" means a softer touch next year.
 */
export function afterActivity(b: Business, a: Activity): Partial<Business> | null {
  const step = b.playbook_step;
  if (!step || step === 'done' || step === 'conversation') return null;
  const o = a.outcome ?? '';

  if (o === 'Not interested') {
    return { playbook_step: 'done', next_action_date: from(a, 365), next_action_note: 'Softer touch: owner said no last year' };
  }
  if (o === 'Interested' || o === 'Spoke to owner' || o === 'Got a response' || o === 'Replied') {
    return {
      playbook_step: 'conversation', stage: atLeast(b.stage, 'conversation'),
      next_action_date: from(a, o === 'Interested' ? 2 : 14),
      next_action_note: o === 'Interested' ? 'Set up coffee (get their best number and a time)' : 'Follow up on your conversation',
    };
  }
  if (o === 'Maybe later') {
    if (step === 'scout') {
      // Playbook: a scouting conversation counts as the first touch, so skip Letter 1 and the Step 4 visit.
      return { playbook_step: 'done', next_action_date: from(a, 17), next_action_note: 'Short call or note (owner said "maybe" at scouting visit)' };
    }
    if (step === 'visit' || step === 'letter2') {
      return { playbook_step: 'done', next_action_date: from(a, 60), next_action_note: 'Check back in (owner said "maybe")' };
    }
    return { playbook_step: 'letter1', next_action_date: null, next_action_note: 'Mail Letter 1 (owner said "maybe")' };
  }

  if (o === 'Got owner name' && (step === 'find_owner' || step === 'scout')) {
    return { playbook_step: 'letter1', next_action_note: 'Mail Letter 1' };
  }

  if (a.kind === 'letter') {
    const isLetter2 = /letter\s*2/i.test(a.campaign ?? '') || step === 'visit' || step === 'letter2';
    if (isLetter2) return { playbook_step: 'done', next_action_date: from(a, 21), next_action_note: 'Sequence finished: decide the next touch' };
    return { playbook_step: 'visit', next_action_date: from(a, VISIT_DAYS_AFTER_LETTER), next_action_note: 'Step 4: stop in to meet the owner' };
  }

  if (a.kind === 'door_knock') {
    if (step === 'find_owner' || step === 'scout') {
      return { playbook_step: 'letter1', next_action_note: 'Mail Letter 1' };
    }
    if (step === 'visit') {
      if (o === 'Left card/letter') return { playbook_step: 'done', next_action_date: from(a, 21), next_action_note: 'Sequence finished: Letter 2 left at the store' };
      if (o === 'Come back later') return { next_action_date: from(a, 7), next_action_note: 'Step 4: try the visit again' };
      return { playbook_step: 'letter2', next_action_date: todayISO(new Date(a.occurred_at)), next_action_note: 'Mail Letter 2, or come back at a better time' };
    }
  }
  return null;
}

/** Called when a business is saved: learning the owner's name finishes Step 1. */
export function afterSave(prev: Business | undefined, next: Business): Partial<Business> | null {
  if (!prev || prev.owner_id || !next.owner_id) return null;
  if (next.playbook_step === 'find_owner' || next.playbook_step === 'scout') return { playbook_step: 'letter1' };
  return null;
}

export function stepDue(b: Business): string | null {
  const s = b.playbook_step;
  if (!s) return null;
  if (s === 'visit' || s === 'letter2' || s === 'done' || s === 'conversation') return b.next_action_date ?? null;
  return STEP_INFO[s].target ?? null;
}

/* ---------- Filling in names ---------- */

const COMPANY = /\b(llc|l\.l\.c|inc|corp|corporation|company|co\.|properties|partners|lp|llp|trust|holdings|group|enterprises)\b/i;
export function isCompanyName(name: string | null | undefined): boolean {
  return !!name && COMPANY.test(name);
}

export interface FillContext {
  profile: Profile;
  business?: Business;
  owner?: Owner;
}

export const PROFILE_FIELDS: { key: keyof Profile; label: string; placeholder: string }[] = [
  { key: 'my_name', label: 'Your name', placeholder: 'First Last' },
  { key: 'spouse_name', label: "Your wife's first name", placeholder: 'First name' },
  { key: 'area', label: 'Where you live (as you say it in letters)', placeholder: 'the Fresno area' },
  { key: 'phone', label: 'Your phone', placeholder: '559-555-0100' },
  { key: 'email', label: 'Your email', placeholder: 'you@example.com' },
  { key: 'financing', label: 'How you plan to finance it', placeholder: 'an SBA loan' },
];

export function missingProfile(p: Profile | null | undefined): string[] {
  return PROFILE_FIELDS.filter((f) => !(p?.[f.key] ?? '').trim()).map((f) => f.label);
}

/** Replaces {{tokens}}; anything unknown shows as [bracketed] so it's obvious on screen. */
export function fill(text: string, ctx: FillContext): string {
  const p = ctx.profile ?? {};
  const ownerName = ctx.owner && !isCompanyName(ctx.owner.name) ? ctx.owner.name : '';
  const map: Record<string, string> = {
    me: p.my_name || '[your name]',
    spouse: p.spouse_name || "[your wife's name]",
    area: p.area || '[your area]',
    phone: p.phone || '[your phone]',
    email: p.email || '[your email]',
    financing: p.financing || '[SBA loan / cash / both]',
    store: ctx.business?.name || '[Laundromat]',
    owner: ownerName || '[Owner name]',
    city: ctx.business?.city || '[city]',
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? `[${k}]`);
}

/** "Dear Jane Doe," when we know a person's name; "Hello," otherwise (or for LLCs). */
export function salutation(owner?: Owner): string {
  return owner && owner.name && !isCompanyName(owner.name) ? `Dear ${owner.name},` : 'Hello,';
}

/** Envelope lines per the mailing checklist. */
export function envelopeLines(b: Business, owner: Owner | undefined, letter: 1 | 2): string[] {
  const person = owner && !isCompanyName(owner.name) ? owner.name : 'Owner';
  if (letter === 2) return [`${person === 'Owner' ? 'Owner' : person} – ${b.name}`];
  return [person, b.name, b.address ?? '', [b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean);
}
