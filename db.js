'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractDomain, categorizeContact } = require('./categorize');

let db = null;

function dbPath() {
  // The runtime sets DATA_DIR when durable state is available; use it and the
  // SQLite-at-DATA_DIR convention gets the strongest durability.
  if (process.env.DATA_DIR) {
    try { fs.mkdirSync(process.env.DATA_DIR, { recursive: true }); } catch (e) { /* read-only */ }
    return path.join(process.env.DATA_DIR, 'app.db');
  }
  // Fallback: a writable folder next to the app locally, or a temp dir when
  // the app root is read-only (published apps).
  let dir;
  try {
    dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    dir = path.join(os.tmpdir(), 'networkrm');
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'networkrm.db');
}

function getDb() {
  if (db) return db;
  db = new DatabaseSync(dbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      domain TEXT DEFAULT '',
      company TEXT DEFAULT '',
      title TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      notes TEXT DEFAULT '',
      context TEXT DEFAULT '',
      first_seen TEXT,
      last_interaction TEXT,
      interaction_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      direction TEXT DEFAULT 'in',
      subject TEXT DEFAULT '',
      snippet TEXT DEFAULT '',
      at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_emails_contact ON emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_emails_at ON emails(at);
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      contacts_added INTEGER DEFAULT 0,
      contacts_updated INTEGER DEFAULT 0,
      emails_added INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS category_hints (
      hint TEXT PRIMARY KEY,
      category TEXT NOT NULL
    );
  `);
  // Migration: sample flag so demo contacts can be removed once real mail
  // arrives without touching real people.
  const cols = db.prepare(`PRAGMA table_info(contacts)`).all().map(c => c.name);
  if (!cols.includes('sample')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN sample INTEGER DEFAULT 0`);
  }
  if (!cols.includes('last_context')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN last_context TEXT DEFAULT ''`);
  }
  return db;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const DEFAULTS = {
  name: 'Alex Morgan',
  email: 'alex@meridian.co',
  work_domain: 'meridian.co'
};

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function getSettings() {
  const d = getDb();
  const out = { ...DEFAULTS };
  for (const row of d.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function setSetting(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value == null ? '' : value));
}

function upsertContact({ name, email, company, title, emails = [], sample = 0 }) {
  const d = getDb();
  const norm = String(email || '').trim().toLowerCase();
  if (!norm || !norm.includes('@')) return null;
  const domain = extractDomain(norm);
  const settings = getSettings();

  const existing = d.prepare('SELECT * FROM contacts WHERE email = ?').get(norm);
  let contactId;
  let created = false;
  if (existing) {
    contactId = existing.id;
    const newName = (name && name !== norm) ? name : existing.name;
    d.prepare(
      'UPDATE contacts SET name = ?, company = COALESCE(?, company), title = COALESCE(?, title) WHERE id = ?'
    ).run(newName, company || null, title || null, contactId);
  } else {
    const info = d.prepare(
      `INSERT INTO contacts (name, email, domain, company, title, category, sample, first_seen, last_interaction, interaction_count)
       VALUES (?, ?, ?, ?, ?, 'other', ?, NULL, NULL, 0)`
    ).run(name || norm, norm, domain, company || '', title || '', sample ? 1 : 0);
    contactId = Number(info.lastInsertRowid);
    created = true;
  }

  let added = 0;
  const myEmail = String(settings.email || '').toLowerCase();
  const ins = d.prepare(
    'INSERT INTO emails (contact_id, direction, subject, snippet, at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const em of emails || []) {
    const at = toIso(em && em.at);
    if (!at) continue;
    const subject = String(em.subject || '').slice(0, 300);
    const snippet = String(em.snippet || '').slice(0, 500);
    const direction = (em.direction || (em.from && String(em.from).toLowerCase() === myEmail ? 'out' : 'in'));
    const dup = d.prepare('SELECT id FROM emails WHERE contact_id = ? AND at = ? AND subject = ?')
      .get(contactId, at, subject);
    if (!dup) {
      ins.run(contactId, direction, subject, snippet, at);
      added++;
    }
  }
  if (added > 0) {
    const agg = d.prepare('SELECT COUNT(*) n, MIN(at) first, MAX(at) last FROM emails WHERE contact_id = ?').get(contactId);
    d.prepare('UPDATE contacts SET interaction_count = ?, first_seen = ?, last_interaction = ? WHERE id = ?')
      .run(agg.n, agg.first, agg.last, contactId);
    const newest = d.prepare('SELECT subject, snippet FROM emails WHERE contact_id = ? ORDER BY at DESC LIMIT 1').get(contactId);
    if (newest) {
      const note = [newest.subject, newest.snippet].filter(Boolean).join(' - ').slice(0, 200);
      d.prepare('UPDATE contacts SET last_context = ? WHERE id = ?').run(note, contactId);
    }
  }

  if (created) {
    const cat = categorizeContact(norm, domain, settings, d);
    d.prepare('UPDATE contacts SET category = ? WHERE id = ?').run(cat, contactId);
  }

  return { contactId, created, added };
}

function listContacts({ category, q } = {}) {
  const d = getDb();
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR title LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const sql = `SELECT * FROM contacts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_interaction DESC`;
  return d.prepare(sql).all(...params);
}

function getContact(id) {
  return getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}

function getEmails(contactId) {
  return getDb().prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY at DESC').all(contactId);
}

function updateContact(id, fields) {
  const d = getDb();
  const allowed = ['name', 'company', 'title', 'category', 'notes', 'context'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (key in fields) { sets.push(`${key} = ?`); params.push(String(fields[key])); }
  }
  if (!sets.length) return getContact(id);
  params.push(id);
  d.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // Remember a manual category choice as a hint for this domain.
  if ('category' in fields && fields.category) {
    const c = getContact(id);
    if (c && c.domain) {
      d.prepare('INSERT OR REPLACE INTO category_hints (hint, category) VALUES (?, ?)').run(c.domain, fields.category);
    }
  }
  return getContact(id);
}

function createContact(name, email) {
  return upsertContact({ name, email, emails: [] });
}

function logImport(source, detail, counts) {
  getDb().prepare(
    'INSERT INTO imports (source, detail, contacts_added, contacts_updated, emails_added) VALUES (?, ?, ?, ?, ?)'
  ).run(source, detail, counts.added || 0, counts.updated || 0, counts.emails || 0);
}

function recentImports(limit = 5) {
  return getDb().prepare('SELECT * FROM imports ORDER BY id DESC LIMIT ?').all(limit);
}

function stats() {
  const d = getDb();
  const total = d.prepare('SELECT COUNT(*) n FROM contacts').get().n;
  const byCategory = { clients: 0, team: 0, investors: 0, partners: 0, vendors: 0, subscriptions: 0, other: 0 };
  for (const row of d.prepare('SELECT category, COUNT(*) n FROM contacts GROUP BY category').all()) {
    if (row.category in byCategory) byCategory[row.category] = row.n;
  }
  const interactions30d = d.prepare(
    "SELECT COUNT(*) n FROM emails WHERE julianday(at) >= julianday('now', '-30 days')"
  ).get().n;
  const staleRows = d.prepare(
    `SELECT * FROM contacts
     WHERE last_interaction IS NOT NULL
       AND julianday(last_interaction) < julianday('now', '-60 days')
     ORDER BY last_interaction ASC LIMIT 6`
  ).all();
  const recent = d.prepare(
    `SELECT e.subject, e.at, e.direction, c.id AS contact_id, c.name, c.email, c.category
     FROM emails e JOIN contacts c ON c.id = e.contact_id
     ORDER BY e.at DESC LIMIT 8`
  ).all();
  const sampleCount = d.prepare('SELECT COUNT(*) n FROM contacts WHERE sample = 1').get().n;
  return { total, byCategory, interactions30d, stale: staleRows, recent, sampleCount };
}

function categoryCounts() {
  const counts = { clients: 0, team: 0, investors: 0, partners: 0, vendors: 0, subscriptions: 0, other: 0 };
  for (const row of getDb().prepare('SELECT category, COUNT(*) n FROM contacts GROUP BY category').all()) {
    if (row.category in counts) counts[row.category] = row.n;
  }
  return counts;
}

function deleteSamples() {
  const d = getDb();
  d.exec(`DELETE FROM emails WHERE contact_id IN (SELECT id FROM contacts WHERE sample = 1);
          DELETE FROM contacts WHERE sample = 1;`);
}

function resetAll() {
  const d = getDb();
  d.exec('DELETE FROM emails; DELETE FROM contacts; DELETE FROM imports; DELETE FROM category_hints; DELETE FROM settings;');
}

module.exports = {
  getDb, dbPath, getSettings, getSetting, setSetting, upsertContact, listContacts, getContact,
  getEmails, updateContact, createContact, logImport, recentImports, stats,
  categoryCounts, deleteSamples, resetAll, DEFAULTS
};
