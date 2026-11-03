import type { Business, Owner, Profile } from './types';
import { LETTER_1, LETTER_1_CLOSE, LETTER_2, LETTER_2_CLOSE } from './playbookContent';
import { envelopeLines, fill, salutation } from './playbook';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function openPrint(title: string, body: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: letter; margin: 1in; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #111; margin: 0; }
  .page { page-break-after: always; padding: 0.25in 0; }
  .page:last-child { page-break-after: auto; }
  p { margin: 0 0 12pt; }
  .sig { margin-top: 36pt; }
  .env { border: 1px dashed #999; border-radius: 6px; padding: 14pt 18pt; margin: 0 0 14pt; page-break-inside: avoid; font-family: Arial, sans-serif; }
  .env .pc { font-size: 9pt; font-weight: bold; letter-spacing: .08em; text-transform: uppercase; color: #444; margin-bottom: 8pt; }
  .env .to { font-size: 13pt; line-height: 1.35; }
  .hint { font-family: Arial, sans-serif; font-size: 10pt; color: #555; margin-bottom: 14pt; }
  @media screen { body { background: #eee; } .page { background: #fff; max-width: 6.5in; margin: 20px auto; padding: 1in; box-shadow: 0 2px 10px rgba(0,0,0,.15); } }
</style></head><body>${body}<script>setTimeout(() => window.print(), 300);</script></body></html>`);
  w.document.close();
}

export interface LetterRecipient {
  business: Business;
  owner?: Owner;
}

export function printLetters(which: 1 | 2, recipients: LetterRecipient[], profile: Profile, mailed = false) {
  const pages = recipients.map(({ business, owner }) => {
    const ctx = { profile, business, owner };
    const body = (which === 1 ? LETTER_1 : LETTER_2(mailed)).map((t) => `<p>${esc(fill(t, ctx))}</p>`).join('');
    const greeting = which === 1 ? salutation(owner) : 'Hello,';
    const close = which === 1 ? LETTER_1_CLOSE : LETTER_2_CLOSE;
    return `<div class="page"><p>${esc(greeting)}</p>${body}<p>${close}</p><p class="sig">${esc(profile.my_name ?? '')}<br>${esc(profile.phone ?? '')}<br>${esc(profile.email ?? '')}</p></div>`;
  });
  // Letter 2 is the same for every store; one page per store still helps with counting envelopes.
  openPrint(which === 1 ? 'Letter 1' : 'Letter 2', pages.join(''));
}

export function printEnvelopes(which: 1 | 2, recipients: LetterRecipient[]) {
  const items = recipients.map(({ business, owner }) => {
    const lines = envelopeLines(business, owner, which).map(esc).join('<br>');
    return `<div class="env">${which === 1 ? '<div class="pc">Personal &amp; Confidential</div>' : ''}<div class="to">${lines}</div></div>`;
  });
  const hint = which === 1
    ? 'Hand-address each envelope from this list. Write "Personal & Confidential" on the front, and use a real stamp and your return address.'
    : 'Pre-write each envelope from this list, leaving room above to add a name if you learn it at the store.';
  openPrint(which === 1 ? 'Letter 1 envelopes' : 'Letter 2 envelopes', `<div class="page"><div class="hint">${hint}</div>${items.join('')}</div>`);
}
