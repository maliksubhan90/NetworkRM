'use strict';

// Load .env for local development (VS Code / npm start). The hosted app gets
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from the deployment environment
// instead, so real environment variables always win.
const fs = require('fs');
const path = require('path');
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  }
} catch (e) { /* ignore */ }

const express = require('express');
const db = require('./lib/db');
const gmail = require('./lib/gmail');
const { CATEGORIES } = require('./lib/categorize');
const { sampleMessages, messagesToItems } = require('./lib/seed');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#17171C"/><text x="16" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">NR</text></svg>');
});

let syncing = false;

// ---- Stats ----------------------------------------------------------------

app.get('/api/stats', (req, res) => {
  res.json({ ...db.stats(), recentImports: db.recentImports() });
});

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES, counts: db.categoryCounts() });
});

// ---- Contacts ---------------------------------------------------------------

app.get('/api/contacts', (req, res) => {
  const category = req.query.category || null;
  const q = (req.query.q || '').trim();
  res.json(db.listContacts({ category, q }));
});

app.get('/api/contacts/:id', (req, res) => {
  const contact = db.getContact(Number(req.params.id));
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json({ contact, emails: db.getEmails(contact.id) });
});

app.post('/api/contacts', (req, res) => {
  const { name, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const result = db.upsertContact({ name, email, emails: [] });
  res.status(201).json({ contact: db.getContact(result.contactId) });
});

app.patch('/api/contacts/:id', (req, res) => {
  const contact = db.updateContact(Number(req.params.id), req.body || {});
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json({ contact });
});

// ---- Manual import (fallback; Gmail sync is the primary path) ---------------

app.post('/api/import/preview', (req, res) => {
  const messages = (req.body && req.body.messages) || [];
  const items = messagesToItems(messages);
  const settings = db.getSettings();
  const rows = items.map(item => {
    const text = item.emails.map(e => [e.subject, e.snippet].join(' ')).join(' ');
    const domain = require('./lib/categorize').extractDomain(item.email);
    const cat = require('./lib/categorize').categorizeFromText(text, domain, settings, db.getDb());
    return {
      name: item.name,
      email: item.email,
      domain,
      category: cat,
      messageCount: item.emails.length,
      sampleSubjects: item.emails.slice(0, 3).map(e => e.subject)
    };
  });
  res.json({ items: rows });
});

app.post('/api/import', (req, res) => {
  const { source = 'manual', items = [] } = req.body || {};
  let added = 0, updated = 0, emails = 0;
  for (const item of items) {
    const r = db.upsertContact(item);
    if (!r) continue;
    if (r.created) added++; else if (r.added) updated++;
    emails += r.added;
  }
  db.logImport(source, `${added} new, ${updated} updated`, { added, updated, emails });
  res.json({ added, updated, emails });
});

app.get('/api/demo', (req, res) => {
  res.json({ messages: sampleMessages() });
});

// ---- Settings ---------------------------------------------------------------

app.get('/api/settings', (req, res) => {
  const s = db.getSettings();
  res.json({ name: s.name, email: s.email, work_domain: s.work_domain });
});

app.patch('/api/settings', (req, res) => {
  for (const key of ['name', 'email', 'work_domain']) {
    if (key in (req.body || {})) db.setSetting(key, req.body[key]);
  }
  const s = db.getSettings();
  res.json({ name: s.name, email: s.email, work_domain: s.work_domain });
});

app.post('/api/reset', (req, res) => {
  db.resetAll();
  seedIfNeeded();
  res.json({ ok: true });
});

app.post('/api/samples/clear', (req, res) => {
  db.deleteSamples();
  res.json({ ok: true });
});

// ---- Gmail: status / config / OAuth / sync -----------------------------------

app.get('/api/gmail/status', (req, res) => {
  const s = db.getSettings();
  const cfg = gmail.clientConfig();
  res.json({
    configured: cfg.configured,
    viaEnv: cfg.viaEnv,
    clientIdMasked: cfg.clientIdMasked,
    secretConfigured: cfg.secretConfigured,
    connected: !!s.gmail_account,
    account: s.gmail_account || null,
    accountName: s.gmail_account_name || '',
    lastSync: s.gmail_last_sync || null,
    syncedCount: Number(s.gmail_synced_count || 0),
    syncState: s.gmail_sync_state || 'idle',
    lastError: s.gmail_last_error || null,
    lastDetail: s.gmail_last_detail || null
  });
});

app.post('/api/gmail/config', (req, res) => {
  if (gmail.clientConfig().viaEnv) {
    return res.status(400).json({ error: 'Gmail credentials come from the deployment environment. Edit them where the app is hosted, not here.' });
  }
  const { clientId, clientSecret } = req.body || {};
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'Both the Client ID and Client Secret are required.' });
  db.setSetting('gmail_client_id', String(clientId).trim());
  db.setSetting('gmail_client_secret', String(clientSecret).trim());
  res.json({ ok: true, configured: true });
});

app.get('/api/gmail/start', (req, res) => {
  if (!gmail.clientConfig().configured) {
    return res.status(400).json({ error: 'Gmail is not configured yet. Add your Google OAuth client credentials on the Gmail page first.' });
  }
  res.redirect(gmail.authUrl(req));
});

app.get('/api/gmail/callback', async (req, res) => {
  try {
    await gmail.handleCallback(req.query.code, req.query.state, req);
    res.redirect('/#/gmail?connected=1');
  } catch (e) {
    console.error('Gmail callback failed:', e.message);
    res.redirect('/#/gmail?auth=failed');
  }
});

app.post('/api/gmail/sync', async (req, res) => {
  const s = db.getSettings();
  if (!s.gmail_account) return res.status(400).json({ error: 'Gmail is not connected.' });
  if (syncing) return res.json({ syncing: true });
  syncing = true;
  db.setSetting('gmail_sync_state', 'running');
  try {
    const max = Math.min(Number((req.body || {}).max) || 400, 1200);
    const summary = await gmail.syncOnce({ maxMessages: max });
    db.setSetting('gmail_sync_state', 'idle');
    db.setSetting('gmail_last_error', '');
    res.json({ ...summary, syncing: false });
  } catch (e) {
    console.error('Gmail sync failed:', e.message);
    db.setSetting('gmail_sync_state', 'error');
    db.setSetting('gmail_last_error', String((e && e.message) || e));
    res.status(500).json({ error: (e && e.message) || 'Sync failed', syncing: false });
  } finally {
    syncing = false;
  }
});

app.post('/api/gmail/disconnect', async (req, res) => {
  await gmail.disconnect();
  res.json({ ok: true });
});

// ---- Seed once on first run ---------------------------------------------------

function seedIfNeeded() {
  const d = db.getDb();
  const count = d.prepare('SELECT COUNT(*) n FROM contacts').get().n;
  if (count > 0) return;
  const items = messagesToItems(sampleMessages());
  let added = 0, emails = 0;
  for (const item of items) {
    const r = db.upsertContact(item);
    if (r) { added++; emails += r.added; }
  }
  db.logImport('initial sync', 'Sample mailbox loaded on first run', { added, updated: 0, emails });
}

seedIfNeeded();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NetworkRM listening on port ${PORT}`);
});
