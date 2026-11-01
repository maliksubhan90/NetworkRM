'use strict';

// Category ids used across the app.
const CATEGORIES = [
  { id: 'clients',  label: 'Clients' },
  { id: 'team',     label: 'Internal team' },
  { id: 'investors', label: 'Investors' },
  { id: 'partners', label: 'Partners' },
  { id: 'vendors',  label: 'Vendors' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'other',    label: 'Other' }
];

// Keyword scoring. Multi-word phrases score higher (length * weight) so
// "invoice from" beats a bare "invoice" for vendors.
const KEYWORDS = {
  clients:   ['invoice', 'campaign', 'contract', 'proposal', 'deliverable', 'feedback', 'brief', 'retainer', 'kickoff', 'project', 'approval', 'creative brief', 'media plan'],
  investors: ['term sheet', 'cap table', 'valuation', 'pitch deck', 'investor update', 'funding', 'round', 'runway', 'board update', 'dilution', 'syndicate'],
  team:      ['standup', 'sprint', 'retro', 'all-hands', '1:1', 'internal', 'planning', 'lunch', 'company-wide', 'onboarding', 'agenda'],
  partners:  ['partnership', 'co-marketing', 'integration', 'reseller', 'joint', 'collab', 'roadmap'],
  vendors:   ['invoice from', 'quote', 'pricing', 'support ticket', 'credentials', 'api key', 'sla', 'usage report', 'hosting plan'],
  subscriptions: ['subscription', 'renewal', 'billing', 'receipt', 'payment received', 'order confirmation', 'your order', 'shipping update', 'monthly plan', 'annual plan', 'trial', 'welcome to', 'plan renews', 'payment failed']
};

function extractDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return '';
  return String(email).slice(at + 1).toLowerCase();
}

// Score a blob of email text (subjects + snippets) against the keyword sets.
// Longer, more specific keywords weigh more, so a "partnership proposal" that
// also mentions "proposal" still reads as a partner, not a client.
function categorizeFromText(text, domain, settings, db) {
  const lower = String(text || '').toLowerCase();
  let best = 'other';
  let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      const occurrences = lower.split(w).length - 1;
      if (occurrences > 0) score += occurrences * (1 + Math.min(w.split(' ').length - 1, 2) + w.length / 12);
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

// Decide the category for a contact. Priority:
// 1. Explicit hint (email or domain) the user has taught us
// 2. The user's own work domain(s) -> internal team
// 3. Keyword scoring over recent email subjects/snippets
function categorizeContact(email, domain, settings, db) {
  const normEmail = String(email || '').toLowerCase();
  const hint = db.prepare('SELECT category FROM category_hints WHERE hint = ?').get(normEmail)
    || db.prepare('SELECT category FROM category_hints WHERE hint = ?').get(domain);
  if (hint) return hint.category;

  const workDomains = String(settings.work_domain || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (workDomains.length && workDomains.includes(domain)) return 'team';

  const rows = db.prepare(
    `SELECT subject, snippet FROM emails
     WHERE contact_id = (SELECT id FROM contacts WHERE email = ?)
     ORDER BY at DESC LIMIT 25`
  ).all(normEmail);
  const text = rows.map(r => [r.subject, r.snippet].join(' ')).join(' ');
  return categorizeFromText(text, domain, settings, db);
}

module.exports = { CATEGORIES, KEYWORDS, extractDomain, categorizeContact, categorizeFromText };
