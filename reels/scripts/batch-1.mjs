// The first 10 reels (24 Sep – 15 Oct 2026). Run: node scripts/batch-1.mjs → writes scripts/<id>.json.
// Voice lines say "Gold Khaataa" and numbers in words (owner's pronunciation rule); captions fix the brand.
// "capture" tells engine/capture.mjs which demo screen to shoot and what to ring.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const WA = { line: 'Questions? <em>WhatsApp us.</em>', l1: 'WhatsApp us', l2: 'wa.me/918804888883', vo: 'Questions? WhatsApp us.' };
const TRIAL = { line: 'Try it <em>free</em> for 30 days.', l1: 'Free for 30 days', l2: 'Start your trial', vo: 'Try Gold Khaataa free for thirty days.' };
const cta = (c) => ({ type: 'cta', line: c.line, l1: c.l1, l2: c.l2, vo: c.vo });

const reels = [
  { id: '2026-09-24_reel-pledge-card', cta: TRIAL, scenes: [
    { type: 'hook', kicker: 'At the counter', text: 'New loan to printed pledge card in', accent: '40 seconds.', vo: 'New gold loan to a printed pledge card, in forty seconds. Watch.' },
    { type: 'screen', label: '1 · Customer', capture: { path: '/loans/new', focus: 'Select Customer' }, vo: 'Pick the customer. Their photo and KYC come up with them.' },
    { type: 'screen', label: '2 · Ornaments', capture: { path: '/loans/new', focus: 'Ornament Details', grow: true, prep: [{ type: ['input[placeholder*="Search"]', 'Harish'], wait: 1800 }, { click: 'Harish Kumar' }, { click: 'Next' }] }, vo: "Add the ornaments and their weight. The loan amount is worked out at today's gold rate." },
    { type: 'screen', label: '3 · Print', capture: { path: '/loans/:id', focus: 'Pledge Card' }, vo: 'Save, and the pledge card prints on your own letterhead, ready to sign.' },
    { type: 'proof', text: 'Your letterhead.', accent: 'One press.' },
  ] },
  { id: '2026-09-26_reel-upi-qr', cta: WA, scenes: [
    { type: 'hook', kicker: 'At a busy counter', text: '₹3,408 or', accent: '₹3,480?', vo: 'Three thousand four hundred and eight, or three thousand four hundred and eighty?' },
    { type: 'screen', label: 'Exact amount', capture: { path: '/payments', focus: 'UPI' }, vo: 'In Gold Khaataa, the UPI QR already carries the exact amount due. The customer only scans and pays.' },
    { type: 'screen', label: 'Every mode', capture: { path: '/payments', focus: 'Mode' }, vo: 'Cash, UPI, both together, bank or cheque. A receipt goes out every time.' },
    { type: 'proof', text: 'No wrong figures.', accent: 'Ever.' },
  ] },
  { id: '2026-09-29_reel-already-paid', cta: WA, scenes: [
    { type: 'hook', kicker: 'Sound familiar?', text: '“I already paid', accent: 'last month.”', vo: 'I already paid last month. Sound familiar?' },
    { type: 'screen', label: 'Every receipt', capture: { path: '/loans/:id', focus: 'Payment' }, vo: 'Open the loan. Every payment is there, with the date and the exact time.' },
    { type: 'card', label: "Customer's copy", card: 'whatsapp', vo: "And the customer already has the same receipt on WhatsApp, from your firm's own number." },
    { type: 'proof', text: 'No more arguments', accent: 'at the counter.' },
  ] },
  { id: '2026-10-01_reel-interest-rules', cta: TRIAL, scenes: [
    { type: 'hook', kicker: 'Who is right?', text: 'Software says ₹4,950. Your book says', accent: '₹4,500.', vo: 'The software says four thousand nine hundred and fifty. Your book says four thousand five hundred. Who is right?' },
    { type: 'screen', label: 'Your rules', capture: { path: '/settings/interest', focus: 'Compounding method' }, vo: 'In Gold Khaataa, you set your own method once. The first month, part months, and yearly compounding.' },
    { type: 'screen', label: 'Every screen follows', capture: { path: '/loans/:id', focus: 'Interest due now' }, vo: 'After that, the loan page, the release bill and every report follow your method.' },
    { type: 'proof', text: 'Your business.', accent: 'Your rules.' },
  ] },
  { id: '2026-10-03_reel-day-close', cta: WA, scenes: [
    { type: 'hook', kicker: 'At closing time', text: '₹500 short. Tonight, or', accent: 'next month?', vo: 'Five hundred rupees short. Do you find out tonight, or next month?' },
    { type: 'screen', label: 'Cash book', capture: { path: '/cash-close', focus: 'Book cash' }, vo: "Gold Khaataa's cash book records every loan, payment and expense as it happens." },
    { type: 'screen', label: 'Day close', capture: { path: '/cash-close', focus: 'Variance' }, vo: 'Count the drawer at closing, and any difference shows up the same evening.' },
    { type: 'proof', text: 'Caught', accent: 'the same evening.' },
  ] },
  { id: '2026-10-06_reel-excel-export', cta: TRIAL, scenes: [
    { type: 'hook', kicker: 'A fair question', text: 'What if you ever want to', accent: 'leave?', vo: 'What if you ever want to leave your software?' },
    { type: 'screen', label: 'One tap', capture: { path: '/settings/backup', focus: 'Export' }, vo: 'In Gold Khaataa, one tap downloads every record. Customers, loans, payments and ornaments, in one Excel file.' },
    { type: 'proof', text: 'Your data.', accent: 'Always yours.' },
  ] },
  { id: '2026-10-08_reel-jewellery-bill', cta: WA, scenes: [
    { type: 'hook', kicker: 'Do you sell jewellery too?', text: 'Loans and sales.', accent: 'One system.', vo: 'Do you sell jewellery too? Then this is for you.' },
    { type: 'screen', label: 'GST bill', capture: { path: '/jewellery/sales/new', focus: 'Item' }, vo: 'Scan the tag, and the item comes onto the bill, with GST worked out.' },
    { type: 'screen', label: 'Old gold', capture: { path: '/jewellery/sales/new', focus: 'Old gold' }, vo: 'Take old gold in exchange, on the same bill.' },
    { type: 'proof', text: 'Same customer.', accent: 'One history.' },
  ] },
  { id: '2026-10-10_reel-customer-portal', cta: WA, scenes: [
    { type: 'hook', kicker: 'All day long', text: '“How much do', accent: 'I owe?”', vo: 'How much do I owe? How many times a day do you hear that?' },
    { type: 'screen', label: 'Customer portal', capture: { path: '/portal', focus: 'mobile number', public: true }, vo: "With Gold Khaataa's customer portal, customers sign in with a code on WhatsApp." },
    { type: 'card', label: 'Their own balance', card: 'portal', vo: 'And they see their principal and interest up to today, by themselves.' },
    { type: 'proof', text: 'Fewer calls.', accent: 'More counter time.' },
  ] },
  { id: '2026-10-13_reel-part-release', cta: TRIAL, scenes: [
    { type: 'hook', kicker: 'Real counter work', text: 'One chain back.', accent: 'The loan goes on.', vo: 'The customer wants one chain back, but the loan should go on.' },
    { type: 'screen', label: 'Part-release', capture: { path: '/loans/:id', focus: 'Release' }, vo: 'In Gold Khaataa, release just that ornament. The loan continues with the rest.' },
    { type: 'screen', label: 'Top-up', capture: { path: '/loans/:id', focus: 'Top-up' }, vo: 'Need more money on the same gold? Add a top-up to the same loan.' },
    { type: 'proof', text: 'Handled.', accent: 'Properly.' },
  ] },
  { id: '2026-10-15_reel-gold-rate', cta: WA, scenes: [
    { type: 'hook', kicker: 'Before the festive season', text: "Today's gold rate.", accent: 'Everywhere.', vo: "Today's gold rate. On every screen, and on your customers' phones." },
    { type: 'screen', label: 'Live rate', capture: { path: '/dashboard', focus: 'Gold rate' }, vo: "Gold Khaataa shows the live gold rate on every screen, so every loan starts from today's price." },
    { type: 'screen', label: 'Rate broadcast', capture: { path: '/whatsapp/campaigns', focus: 'rate' }, vo: 'And a weekly gold rate message goes to your customers, from your own WhatsApp number.' },
    { type: 'proof', text: 'Right rate.', accent: 'Right away.' },
  ] },
];

for (const r of reels) {
  const file = new URL(`./${r.id}.json`, import.meta.url);
  // Keep shots/focus boxes already filled in by capture.mjs.
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const scenes = [...r.scenes, cta(r.cta)].map((s, i) => ({ ...s, ...(old?.scenes?.[i]?.shot ? { shot: old.scenes[i].shot, shotWidth: old.scenes[i].shotWidth, focus: old.scenes[i].focus, scrollY: old.scenes[i].scrollY } : {}) }));
  writeFileSync(file, JSON.stringify({ id: r.id, music: 'music/bed.mp3', scenes }, null, 2) + '\n');
  const words = scenes.map((s) => s.vo || '').join(' ').split(/\s+/).filter(Boolean).length;
  console.log(`${r.id.padEnd(34)} ${scenes.length} scenes, ${words} words (~${Math.round(words / 2.6 + scenes.length * 0.9)} s)`);
}
