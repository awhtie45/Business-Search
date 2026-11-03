import type { PlaybookStep } from './types';

/**
 * Laundromat Outreach Playbook text. {{tokens}} are filled from Settings → Your details
 * ({{me}}, {{spouse}}, {{area}}, {{phone}}, {{email}}, {{financing}}) and from the business
 * ({{store}}, {{owner}}, {{city}}). **bold** is supported in any text.
 */
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'script'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'check'; items: string[] }
  | { t: 'table'; head: [string, string]; rows: [string, string][] }
  | { t: 'letter'; which: 1 | 2 };

export const INTRO: Block[] = [
  { t: 'p', text: "The plan: learn each owner's name, mail Letter 1, stop in to meet them, and leave Letter 2 if they're out. Every touch is short, personal and confidential." },
  { t: 'p', text: 'Five steps, about two to three weeks apart, so each owner hears from you several times without feeling chased.' },
  { t: 'p', text: "If you reach an owner at any step, that conversation becomes their next touch. Skip ahead rather than repeat a step they've already had." },
];

export const VOICEMAIL: Block = {
  t: 'script',
  text: "Hi, this is {{me}} at {{phone}}. I'm a local resident and wanted to send a note to the owner of {{store}}. If you could call me back with the owner's name, I'd appreciate it. Again, that's {{phone}}. Thanks.",
};

export const STEP_CONTENT: Partial<Record<PlaybookStep, { goal: string; blocks: Block[] }>> = {
  find_owner: {
    goal: 'A name for every envelope, so Letter 1 reads as personal mail. Call first; it\'s the fastest way to cover the whole list in an evening or two.',
    blocks: [
      { t: 'h', text: 'Call script: an employee answers' },
      { t: 'script', text: "Hi, I'd like to mail a note to the owner. Could I get their name and how to spell it?" },
      { t: 'p', text: 'If they ask why:' },
      { t: 'script', text: "I'm a local resident and just wanted to send them a personal note." },
      { t: 'p', text: "If they press, \"it's a business inquiry\" is enough. Don't mention buying the store. Thank them and hang up." },
      { t: 'h', text: 'Call script: the owner answers' },
      { t: 'script', text: "Oh, great, you're who I was hoping to reach. My name's {{me}}. My wife, {{spouse}}, and I live here in {{area}}, and we're looking to buy a laundromat to run as a family business. I was calling to get your name so I could mail you a letter, but since I have you: is selling ever something you'd consider, now or down the road?" },
      { t: 'list', items: [
        '**Interested:** "Could we grab coffee this week or next?" Get a good number and a time. Save revenue and lease questions for that meeting.',
        '**"Maybe someday" or "not now":** "Totally understand. Mind if I send you a short letter with my info?" Then mail Letter 1.',
        '**No:** "No problem, thanks for your time." Keep them on the list for a softer touch next year.',
      ] },
      { t: 'p', text: 'Be honest from the first sentence. If the owner asks why you want their name, tell them.' },
      { t: 'p', text: '**After each call,** write down the name, who answered, the best time to catch the owner if you learned it, and anything they said.' },
      { t: 'h', text: 'Voicemail (a store voicemail may be heard by staff, so keep it neutral)' },
      VOICEMAIL,
      { t: 'h', text: 'Where names come from' },
      { t: 'list', items: [
        '**Calling the store** (scripts above).',
        '**Posted signs:** many laundromats display a city business license or a "for service call" notice with the owner\'s name.',
        '**California Secretary of State (bizfile Online):** LLC and corporation filings list managers, officers or a registered agent.',
        '**County fictitious business name (DBA) filings:** Fresno and Madera counties list the owner behind a store name.',
        '**County assessor records:** if the owner also owns the building.',
        '**Google and Yelp review replies,** which owners often sign.',
        '**Your broker,** who may already have names from the postcard mailing.',
      ] },
    ],
  },
  scout: {
    goal: "Learn the owner's name and when they're usually in, and see the store, without pitching anyone. Walk in like a customer. Spend five to ten minutes. Bring a few sealed copies of Letter 1 in case you meet the owner.",
    blocks: [
      { t: 'p', text: "**What to look for:** a posted business license or service-call sign with the owner's name, the number and condition of machines, cleanliness, how busy it is, and whether an attendant is on duty." },
      { t: 'h', text: 'If the owner approaches you' },
      { t: 'script', text: "Hi, I'm {{me}}. My wife, {{spouse}}, and I live here in {{area}}, and we're looking to buy a laundromat to run as a family business. Is selling ever something you'd consider, now or down the road?" },
      { t: 'p', text: 'Then follow the same branches as the owner phone call. Hand them a copy of Letter 1 with your card before you leave.' },
      { t: 'p', text: '**Do you come back later?** Not as a drop-in. This conversation counts as their first touch, so skip the mailed Letter 1 and the Step 4 visit for this store. Follow up on whatever you agreed: coffee if they\'re interested, or a short call or note in two to three weeks if they said "maybe."' },
      { t: 'h', text: 'If an employee approaches you' },
      { t: 'script', text: "Just checking the place out. Is the owner around much? What's their name? When are they usually in?" },
      { t: 'p', text: 'If they ask why: "I\'d like to introduce myself sometime." Don\'t mention buying.' },
      { t: 'p', text: '**Do you come back later?** Yes. Write down the name and the best time, mail Letter 1, then plan your Step 4 visit for that time.' },
      { t: 'h', text: 'If no one approaches you' },
      { t: 'p', text: "Look around, note what you see and any posted name, and leave quietly. Don't leave anything behind yet. Mail Letter 1, then come back for Step 4." },
      { t: 'p', text: '**Always ask for the best time to catch the owner** when you talk to an employee. It decides when you schedule Step 4.' },
    ],
  },
  letter1: {
    goal: 'A private first introduction, mailed by Nov 10. Use "Dear [Name]," when you have a name and "Hello," when you don\'t.',
    blocks: [
      { t: 'letter', which: 1 },
      { t: 'h', text: 'Mailing checklist' },
      { t: 'check', items: [
        'Sign each letter by hand in blue ink.',
        'Tuck one business card inside.',
        'Hand-address the envelope: owner\'s name, or "Owner," then the laundromat\'s name and store address.',
        'Write "Personal & Confidential" on the front.',
        'Use a real stamp and your return address (a PO box works).',
        'Email the owners you have addresses for on the same day, with a short note pointing to the letter.',
        'Log the mailing date for each store.',
      ] },
    ],
  },
  visit: {
    goal: 'Put a face to Letter 1. Go about two weeks after it lands (early December), starting with your Priority A stores.',
    blocks: [
      { t: 'p', text: "**Timing:** go at the best time you learned in Steps 1 or 2. If you don't know it, try a weekday morning, when owners often do collections and maintenance. Avoid busy weekend afternoons." },
      { t: 'h', text: 'Before you go, prepare one envelope per store' },
      { t: 'check', items: [
        'Letter 2, signed by hand, folded in thirds with one business card inside.',
        'Sealed, with "Owner – [Laundromat Name]" on the front and room above it to add a name.',
        'A pen in your pocket.',
      ] },
      { t: 'h', text: 'If the owner is there' },
      { t: 'script', text: "Hi, are you {{owner}}? (No name yet: \"Hi, are you the owner?\") I'm {{me}}. My wife, {{spouse}}, and I sent you a letter a couple of weeks ago. We live here in {{area}}, and I just wanted to put a face to the letter. We're looking to buy a laundromat to run ourselves. If selling is ever something you'd consider, now or down the road, I'd love to buy you a coffee sometime and hear about the business. No rush at all." },
      { t: 'list', items: [
        '**Interested:** set up coffee and get their best number.',
        '**No:** "Totally understand. Mind if I leave my card in case anything changes?" Thank them and go.',
        'Keep it under five minutes, and keep your voice down around customers and staff.',
      ] },
      { t: 'h', text: 'If only an employee is there' },
      { t: 'script', text: "Hi, is the owner around today? … No problem. When are they usually in? … What's their name, so I can put it on this?" },
      { t: 'p', text: 'Add the name to the envelope at the counter, then: "Could you make sure they get this? Thanks." If they ask what it\'s about: "Just a personal note. I sent them a letter recently." Don\'t mention buying or selling.' },
      { t: 'p', text: "**If no one is there,** don't leave the envelope on a counter or machine. Mail Letter 2 instead, or come back at a better time." },
      { t: 'p', text: 'Bringing your wife on a visit or two backs up the "family business" message better than anything in writing.' },
    ],
  },
  letter2: {
    goal: 'Show you did what Letter 1 said you would. Leave it when the owner isn\'t there. It opens with "Hello," so one printed version works for every store, and the name goes on the envelope.',
    blocks: [
      { t: 'letter', which: 2 },
      { t: 'h', text: 'How to package it' },
      { t: 'list', items: [
        'Sign by hand in blue ink. A short handwritten line at the bottom, like "Nice store!", makes it more personal.',
        'Fold in thirds with one business card inside, seal it, and pre-write "Owner – [Laundromat Name]" on the front.',
        'If you end up mailing it instead of leaving it, change "today" to "recently."',
      ] },
    ],
  },
};

export const TOUGH_QUESTIONS: Block[] = [
  { t: 'p', text: 'Answer honestly and briefly, then steer back to getting to know the owner.' },
  { t: 'table', head: ['They ask', 'You say'], rows: [
    ['"Are you a broker?"', '"No, I\'m the buyer. My wife and I would own and run it. I\'ve worked with a broker to find opportunities, but this is us reaching out directly."'],
    ['"How did you get my name?"', '"From public listings, and I called the store." Say exactly where it came from.'],
    ['"What would you pay?"', '"It depends on the numbers: revenue, expenses, the lease and the equipment. I\'d want to understand the business first, and I\'ll be straight with you once I do." Don\'t name a price or a multiple yet.'],
    ['"Can you afford it?"', '"Yes. We plan to finance it through {{financing}}." Be ready to show proof of funds later.'],
    ['"What would you change?"', '"We\'d want to keep what works. It\'s too early to plan changes."'],
    ['"Who else are you talking to?"', '"A few owners in the area. We\'re not in a rush."'],
    ['"I\'m not interested."', '"Totally understand. Would it be OK if I checked back in a year or so?"'],
  ] },
];

export const FIRST_MEETING: Block[] = [
  { t: 'p', text: "Goal: build trust and learn the owner's story and reasons for selling. Don't negotiate at the first coffee." },
  { t: 'h', text: 'Ask' },
  { t: 'list', items: [
    'How did you get into the business, and how long have you owned this store?',
    "What do you enjoy about it, and what's hardest?",
    'How involved are you day to day? Who works for you?',
    'If you sold, what would matter most to you: price, timing, your staff, your customers?',
    'What would a good timeline look like for you?',
    'Do you own the building or lease it? How much time is left on the lease?',
  ] },
  { t: 'h', text: 'Avoid' },
  { t: 'list', items: ['Asking for tax returns or financials at this meeting.', 'Naming a price.', 'Pointing out problems with the store.', 'Promising anything.'] },
  { t: 'p', text: "**Close with a next step.** If they're open to it, offer to sign a confidentiality agreement (NDA) and ask what they'd be comfortable sharing next time." },
  { t: 'p', text: '**Within a day,** text or mail a short thank-you.' },
];

export const NDA_DOCS: Block[] = [
  { t: 'p', text: 'For a laundromat, ask for:' },
  { t: 'check', items: [
    'Two to three years of profit-and-loss statements or tax returns',
    'Utility bills (water and gas usage are the standard way to check revenue)',
    'The lease',
    'An equipment list with ages',
  ] },
];

/** Letter bodies. The greeting line is added separately (Dear [Name], / Hello,). */
export const LETTER_1 = [
  "My wife, {{spouse}}, and I live here in {{area}}, and we're looking to buy a local laundromat to own and run as a family business.",
  "If you've ever thought about selling, whether now or a few years down the road, we'd love to hear your story and talk about what might work for you. Anything we discuss will stay between us.",
  "I may stop by the store in the next few weeks to introduce myself in person. In the meantime, feel free to call, text, or email me at your convenience. Our contact information is below. And if the timing isn't right, you're welcome to hold on to this letter for later.",
  'Thank you for your time.',
];
export const LETTER_1_CLOSE = 'Sincerely,';

export const LETTER_2 = (mailed: boolean) => [
  `I stopped by ${mailed ? 'recently' : 'today'} to introduce myself in person, as I mentioned in my recent letter. Sorry I missed you.`,
  "My wife, {{spouse}}, and I are looking to buy a laundromat here in {{area}} to run as a family business. If you'd ever consider selling, now or down the road, I'd be glad to grab a coffee and hear about the business. Anything we discuss will stay between us.",
  'Feel free to call, text, or email me anytime. My contact information is below.',
];
export const LETTER_2_CLOSE = 'Thank you,';
