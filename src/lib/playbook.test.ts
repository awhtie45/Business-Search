import { describe, expect, it } from 'vitest';
import { afterActivity, afterSave, fill, salutation, envelopeLines, isCompanyName } from './playbook';
import type { Activity, Business, Owner } from './types';

const biz = (p: Partial<Business> = {}): Business => ({
  id: 'b', type_id: 't', owner_id: null, name: 'Suds City', address: '12 Main St', city: 'Fresno', state: 'CA', zip: '93705',
  geocode_status: 'ok', stage: 'contacted', priority: 2, ruled_out: false, custom: {}, playbook_step: 'find_owner', ...p,
});
const act = (p: Partial<Activity>): Activity => ({ id: 'a', business_id: 'b', kind: 'call', occurred_at: '2026-11-04T17:00:00Z', ...p });

describe('playbook rules', () => {
  it('owner name learned on a call → Letter 1', () => {
    expect(afterActivity(biz(), act({ outcome: 'Got owner name' }))?.playbook_step).toBe('letter1');
    expect(afterSave(biz(), biz({ owner_id: 'o1' }))?.playbook_step).toBe('letter1');
    expect(afterSave(biz({ owner_id: 'o1' }), biz({ owner_id: 'o1' }))).toBeNull(); // already had a name
  });
  it('"maybe" on the owner call → mail Letter 1', () => {
    expect(afterActivity(biz(), act({ outcome: 'Maybe later' }))?.playbook_step).toBe('letter1');
  });
  it('interested at any step → conversation, coffee follow-up', () => {
    const r = afterActivity(biz({ playbook_step: 'letter1', stage: 'prospect' }), act({ outcome: 'Interested' }))!;
    expect(r.playbook_step).toBe('conversation');
    expect(r.stage).toBe('conversation');
    expect(r.next_action_note).toMatch(/coffee/);
  });
  it('no → softer touch in a year', () => {
    const r = afterActivity(biz({ playbook_step: 'visit' }), act({ kind: 'door_knock', outcome: 'Not interested' }))!;
    expect(r.playbook_step).toBe('done');
    expect(r.next_action_date).toBe('2027-11-04');
  });
  it('scouting "maybe" skips Letter 1 and the visit', () => {
    const r = afterActivity(biz({ playbook_step: 'scout' }), act({ kind: 'door_knock', outcome: 'Maybe later' }))!;
    expect(r.playbook_step).toBe('done');
    expect(r.next_action_date).toBe('2026-11-21');
  });
  it('Letter 1 mailed → visit about 2 weeks after it lands', () => {
    const r = afterActivity(biz({ playbook_step: 'letter1' }), act({ kind: 'letter', campaign: 'Letter 1', outcome: 'Sent', occurred_at: '2026-11-08T17:00:00Z' }))!;
    expect(r.playbook_step).toBe('visit');
    expect(r.next_action_date).toBe('2026-11-25');
  });
  it('visit outcomes: left with staff → done; nobody there → Letter 2', () => {
    expect(afterActivity(biz({ playbook_step: 'visit' }), act({ kind: 'door_knock', outcome: 'Left card/letter' }))?.playbook_step).toBe('done');
    expect(afterActivity(biz({ playbook_step: 'visit' }), act({ kind: 'door_knock', outcome: 'Closed / nobody there' }))?.playbook_step).toBe('letter2');
    expect(afterActivity(biz({ playbook_step: 'letter2' }), act({ kind: 'letter', campaign: 'Letter 2' }))?.playbook_step).toBe('done');
  });
  it('does nothing for businesses off the playbook', () => {
    expect(afterActivity(biz({ playbook_step: null }), act({ outcome: 'Interested' }))).toBeNull();
  });
});

describe('letters', () => {
  const jane: Owner = { id: 'o', name: 'Jane Doe', do_not_contact: false };
  const llc: Owner = { id: 'o2', name: "KINGSBURG'S LAUNDRY ROOM, LLC", do_not_contact: false };
  it('greets people by name and companies with Hello', () => {
    expect(salutation(jane)).toBe('Dear Jane Doe,');
    expect(salutation(llc)).toBe('Hello,');
    expect(salutation(undefined)).toBe('Hello,');
    expect(isCompanyName('TCC PROPERTIES, INC.')).toBe(true);
  });
  it('fills tokens and flags missing details', () => {
    expect(fill('{{me}} and {{spouse}} in {{area}}', { profile: { my_name: 'A', spouse_name: 'L', area: 'the Fresno area' } })).toBe('A and L in the Fresno area');
    expect(fill('Call {{phone}}', { profile: {} })).toBe('Call [your phone]');
  });
  it('addresses envelopes per the checklist', () => {
    expect(envelopeLines(biz(), jane, 1)).toEqual(['Jane Doe', 'Suds City', '12 Main St', 'Fresno, CA 93705']);
    expect(envelopeLines(biz(), llc, 1)[0]).toBe('Owner');
    expect(envelopeLines(biz(), undefined, 2)).toEqual(['Owner – Suds City']);
  });
});
