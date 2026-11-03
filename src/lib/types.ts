export type ID = string;

export interface CustomFieldDef {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'yesno';
}

export interface BusinessType {
  id: ID;
  name: string;
  fields: CustomFieldDef[];
  created_at?: string;
}

export interface Owner {
  id: ID;
  name: string;
  phone?: string | null;
  email?: string | null;
  mailing_address?: string | null;
  do_not_contact: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type GeocodeStatus = 'pending' | 'ok' | 'failed' | 'manual';

export interface Business {
  id: ID;
  type_id: ID | null;
  owner_id: ID | null;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  hours?: string | null;
  lat?: number | null;
  lng?: number | null;
  geocode_status: GeocodeStatus;
  stage: StageKey;
  priority: 1 | 2 | 3;
  ruled_out: boolean;
  rule_out_reason?: string | null;
  rule_out_note?: string | null;
  revisit_date?: string | null;
  next_action_date?: string | null;
  next_action_note?: string | null;
  revenue?: number | null;
  sde?: number | null;
  asking_price?: number | null;
  source?: string | null;
  notes?: string | null;
  custom: Record<string, string | number | boolean | null>;
  last_activity_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Activity {
  id: ID;
  business_id: ID;
  kind: ActivityKind;
  outcome?: string | null;
  notes?: string | null;
  campaign?: string | null;
  occurred_at: string;
  created_at?: string;
}

export interface RouteStop {
  business_id: ID;
  done: boolean;
}

export interface SavedRoute {
  id: ID;
  name: string;
  start_label?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  end_label?: string | null;
  end_lat?: number | null;
  end_lng?: number | null;
  stops: RouteStop[];
  distance_m?: number | null;
  duration_s?: number | null;
  geometry?: [number, number][] | null;
  created_at?: string;
}

export interface Settings {
  id: ID;
  ors_api_key?: string | null;
  knock_cooldown_days: number;
  default_start?: string | null;
  default_end?: string | null;
  /** Reference points drawn as red dots on every map (home, a school, the office…). */
  landmarks?: Landmark[] | null;
}

export interface Landmark {
  id: ID;
  label: string;
  lat: number;
  lng: number;
}

export const STAGES = [
  { key: 'prospect', label: 'Prospect', color: '#64748b' },
  { key: 'contacted', label: 'Contacted', color: '#2563eb' },
  { key: 'conversation', label: 'In conversation', color: '#7c3aed' },
  { key: 'nda', label: 'NDA signed', color: '#db2777' },
  { key: 'financials', label: 'Financials received', color: '#ea580c' },
  { key: 'loi', label: 'LOI', color: '#ca8a04' },
  { key: 'diligence', label: 'Due diligence', color: '#16a34a' },
  { key: 'closed', label: 'Closed', color: '#065f46' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export const ACTIVITY_KINDS = [
  { key: 'call', label: 'Call', icon: '📞' },
  { key: 'door_knock', label: 'Door knock', icon: '🚪' },
  { key: 'postcard', label: 'Postcard', icon: '📮' },
  { key: 'letter', label: 'Letter', icon: '✉️' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'text', label: 'Text', icon: '💬' },
  { key: 'meeting', label: 'Meeting', icon: '🤝' },
  { key: 'note', label: 'Note', icon: '📝' },
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]['key'];

export const OUTCOMES: Record<ActivityKind, string[]> = {
  call: ['No answer', 'Left voicemail', 'Spoke to staff', 'Spoke to owner', 'Wrong number', 'Not interested', 'Call back later', 'Interested'],
  door_knock: ['Closed / nobody there', 'Spoke to staff', 'Spoke to owner', 'Left card/letter', 'Not interested', 'Come back later', 'Interested'],
  postcard: ['Sent', 'Returned undeliverable'],
  letter: ['Sent', 'Returned undeliverable', 'Got a response'],
  email: ['Sent', 'Replied', 'Bounced'],
  text: ['Sent', 'Replied'],
  meeting: ['Held', 'Rescheduled', 'No-show'],
  note: [],
};

export const RULE_OUT_REASONS = [
  'Owner not selling',
  'Too small',
  'Too large / too expensive',
  'Bad lease',
  'Poor condition',
  'Out of area',
  'Closed permanently',
  'Chain / corporate owned',
  'Duplicate',
  'Other',
];

export function stageInfo(key: string) {
  return STAGES.find((s) => s.key === key) ?? STAGES[0];
}
export function kindInfo(key: string) {
  return ACTIVITY_KINDS.find((k) => k.key === key) ?? ACTIVITY_KINDS[ACTIVITY_KINDS.length - 1];
}
