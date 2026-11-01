'use strict';

// Live Gmail sync for NetworkRM.
// OAuth flow + Gmail API scraping that maps real messages into the same
// contact-shaped items the manual import uses, so everything else in the app
// (categorization, dedupe, dashboard) works unchanged.

const crypto = require('crypto');
const db = require('./db');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

const NO_REPLY_RE = /^(no[-_]?reply|donotreply|do[-_]?not[-_]?reply|noreply|mailer[-_]?daemon|postmaster|bounce|alert|notification|automail|noreplies|nobody)/i;

// ---------------------------------------------------------------------------
// Config (env wins, otherwise the settings table, which the Settings page
// can write when the app was not published with credentials baked in).
// ---------------------------------------------------------------------------

function clientConfig() {
  const envId = process.env.GOOGLE_CLIENT_ID || '';
  const envSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const s = db.getSettings();
  const id = envId || s.gmail_client_id || '';
  const secret = envSecret || s.gmail_client_secret || '';
  return {
    id,
    secret,
    viaEnv: !!(envId && envSecret),
    configured: !!(id && secret),
    clientIdMasked: id ? mask(id) : '',
    secretConfigured: !!secret
  };
}

function mask(value) {
  const v = String(value || '');
  if (v.length <= 8) return '••••••••';
  return v.slice(0, 4) + '••••' + v.slice(-4);
}

function redirectUri(req) {
  const host = req.get('host') || '';
  let proto = req.protocol || 'https';
  if (proto !== 'https' && host.includes('apps.argus.hermessi.com')) proto = 'https';
  return `${proto}://${host}/api/gmail/callback`;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

function authUrl(req) {
  const c = clientConfig();
  const state = crypto.randomBytes(16).toString('hex');
  db.setSetting('gmail_state', state);
  db.setSetting('gmail_state_expires', String(Date.now() + 10 * 60 * 1000));
  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true'
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

async function exchangeCode(code, redirectUriValue) {
  const c = clientConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.id,
      client_secret: c.secret,
      redirect_uri: redirectUriValue,
      grant_type: 'authorization_code'
    }).toString()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Google rejected the authorization code');
  }
  if (!data.refresh_token) {
    throw new Error('Google did not return a refresh token. Grant consent again from the Gmail page.');
  }
  return data;
}

async function refreshAccessToken(refreshToken) {
  const c = clientConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: c.id,
      client_secret: c.secret,
      grant_type: 'refresh_token'
    }).toString()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Could not refresh the Gmail token');
  }
  return data;
}

async function getAccessToken() {
  const refresh = db.getSetting('gmail_refresh_token');
  if (!refresh) throw new Error('Gmail is not connected');
  let access = db.getSetting('gmail_access_token');
  const expires = Number(db.getSetting('gmail_token_expires') || 0);
  if (!access || Date.now() > expires - 60000) {
    const data = await refreshAccessToken(refresh);
    access = data.access_token;
    db.setSetting('gmail_access_token', access);
    db.setSetting('gmail_token_expires', String(Date.now() + (Number(data.expires_in) || 3600) * 1000));
  }
  return access;
}

async function fetchProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || 'Could not fetch the Google profile');
  }
  return data;
}

// Validates the callback, exchanges the code, saves tokens + account.
async function handleCallback(code, state, req) {
  if (!code || !state) throw new Error('Missing authorization parameters');
  const savedState = db.getSetting('gmail_state');
  const expires = Number(db.getSetting('gmail_state_expires') || 0);
  if (!savedState || savedState !== state || Date.now() > expires) {
    throw new Error('The sign-in link expired. Please try again from the Gmail page.');
  }
  const tokens = await exchangeCode(code, redirectUri(req));
  const profile = await fetchProfile(tokens.access_token);

  db.setSetting('gmail_access_token', tokens.access_token);
  db.setSetting('gmail_refresh_token', tokens.refresh_token);
  db.setSetting('gmail_token_expires', String(Date.now() + (Number(tokens.expires_in) || 3600) * 1000));
  db.setSetting('gmail_account', String(profile.email || '').toLowerCase());
  db.setSetting('gmail_account_name', profile.name || '');
  db.setSetting('gmail_last_sync', '');
  db.setSetting('gmail_sync_state', 'idle');
  db.setSetting('gmail_last_error', '');
  db.setSetting('gmail_state', '');
  db.setSetting('gmail_state_expires', '');

  // Senders from your own domain are Internal team: make sure the account's
  // domain is on the work-domain list (keeps the CEO's own colleagues tagged
  // correctly without any manual work).
  const domain = String(profile.email || '').split('@').pop().toLowerCase();
  if (domain && domain.includes('.')) {
    const wd = String(db.getSetting('work_domain') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!wd.includes(domain)) {
      wd.push(domain);
      db.setSetting('work_domain', wd.join(','));
    }
  }

  return profile;
}

async function disconnect() {
  const access = db.getSetting('gmail_access_token');
  if (access) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(access), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } catch (e) { /* best effort */ }
  }
  for (const key of [
    'gmail_access_token', 'gmail_refresh_token', 'gmail_token_expires',
    'gmail_account', 'gmail_account_name', 'gmail_last_sync',
    'gmail_sync_state', 'gmail_last_error', 'gmail_last_detail'
  ]) {
    db.setSetting(key, '');
  }
}

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------

async function listMessages(token, { q, maxResults = 100, pageToken } = {}) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('maxResults', String(maxResults));
  if (q) url.searchParams.set('q', q);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || 'Could not list messages');
  }
  return data;
}

async function getMessageMeta(token, id) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set('format', 'metadata');
  for (const h of ['From', 'To', 'Cc', 'Subject', 'Date']) {
    url.searchParams.append('metadataHeaders', h);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || 'Could not fetch message');
  }
  return data;
}

// ---------------------------------------------------------------------------
// Header decoding (RFC 2047 encoded words, folded commas, name <email>)
// ---------------------------------------------------------------------------

function decodeMimeWords(str) {
  const text = String(str == null ? '' : str);
  if (!/=?[^?]+\?[bBqQ]\?/.test(text)) return text.trim();
  return text.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, charset, enc, body) => {
    try {
      if (enc.toLowerCase() === 'b') {
        return Buffer.from(body, 'base64').toString('utf8');
      }
      return decodeURIComponent(body.replace(/_/g, '%20').replace(/=/g, '%'));
    } catch (e) {
      return m;
    }
  }).trim();
}

function parseAddressList(value) {
  const out = [];
  const str = String(value || '');
  const parts = [];
  let cur = '';
  let depth = 0;
  let inQuote = false;
  for (const ch of str) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '<') depth++;
      else if (ch === '>') depth--;
      else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/<([^>]+)>/);
    let email = m ? m[1].trim() : p;
    let name = m ? p.slice(0, m.index).trim().replace(/^"|"$/g, '') : '';
    if (!m && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)) continue;
    email = email.toLowerCase();
    name = decodeMimeWords(name);
    if (!name || name === email) name = '';
    out.push({ name, email });
  }
  return out;
}

function isNoReply(email) {
  const local = String(email || '').split('@')[0];
  return NO_REPLY_RE.test(local);
}

// ---------------------------------------------------------------------------
// Build contact items from fetched messages
// ---------------------------------------------------------------------------

function buildItems(messages, myEmail) {
  const me = String(myEmail || '').toLowerCase();
  const byEmail = new Map();

  const add = (addr, direction, subject, at, snippet) => {
    if (!addr || !addr.email || addr.email === me) return;
    if (isNoReply(addr.email)) return;
    const key = addr.email;
    let item = byEmail.get(key);
    if (!item) {
      item = { name: addr.name || '', email: key, emails: [] };
      byEmail.set(key, item);
    }
    item.emails.push({ direction, subject, snippet, at });
  };

  for (const msg of messages || []) {
    const headers = {};
    for (const h of (msg.payload && msg.payload.headers) || []) {
      headers[String(h.name || '').toLowerCase()] = h.value;
    }
    const subject = decodeMimeWords(headers.subject) || '(no subject)';
    let at = new Date(Number(msg.internalDate) || Date.now()).toISOString();
    if (headers.date) {
      const d = new Date(headers.date);
      if (!isNaN(d.getTime())) at = d.toISOString();
    }
    const snippet = String(msg.snippet || '').slice(0, 500);

    const fromList = parseAddressList(headers.from);
    if (!fromList.length) continue;
    const from = fromList[0];

    if (from.email === me) {
      const counterparts = [
        ...parseAddressList(headers.to),
        ...parseAddressList(headers.cc)
      ].filter(a => a.email !== me && !isNoReply(a.email));
      for (const a of counterparts) add(a, 'out', subject, at, snippet);
    } else {
      if (isNoReply(from.email)) continue;
      add(from, 'in', subject, at, snippet);
    }
  }
  return [...byEmail.values()];
}

// ---------------------------------------------------------------------------
// One sync run
// ---------------------------------------------------------------------------

async function syncOnce({ maxMessages = 400, days = 180 } = {}) {
  const token = await getAccessToken();
  const me = db.getSetting('gmail_account');
  if (!me) throw new Error('Gmail is not connected');

  const lastSync = db.getSetting('gmail_last_sync');
  // Incremental syncs start just before the previous run so nothing slips
  // between the gap; upsert dedupes by (contact, date, subject).
  const since = lastSync
    ? Math.floor((Date.now() - 3600 * 1000) / 1000)
    : Math.floor((Date.now() - days * 86400 * 1000) / 1000);
  const q = `in:anywhere after:${since}`;

  let pageToken = null;
  let scanned = 0;
  const messages = [];
  while (scanned < maxMessages) {
    const page = await listMessages(token, { q, maxResults: 100, pageToken });
    const ids = (page.messages || []).slice(0, maxMessages - scanned);
    if (!ids.length) break;
    for (const { id } of ids) {
      try {
        messages.push(await getMessageMeta(token, id));
      } catch (e) { /* skip messages that fail individually */ }
      scanned++;
    }
    if (!page.nextPageToken || scanned >= maxMessages) break;
    pageToken = page.nextPageToken;
  }

  const items = buildItems(messages, me);
  let added = 0, updated = 0, emails = 0;
  for (const item of items) {
    const r = db.upsertContact(item);
    if (!r) continue;
    if (r.created) added++;
    if (r.added) { updated++; emails += r.added; }
  }

  db.setSetting('gmail_last_sync', new Date().toISOString());
  db.setSetting('gmail_synced_count', String((Number(db.getSetting('gmail_synced_count')) || 0) + emails));
  db.setSetting('gmail_last_detail', `Scanned ${messages.length} messages · ${added} new contacts · ${emails} emails`);
  db.logImport('gmail sync', `Scanned ${messages.length} messages`, { added, updated, emails });
  // Real mail arrived: drop the demo sample contacts so the rolodex shows
  // only real people.
  if (emails > 0) db.deleteSamples();
  return { scanned: messages.length, added, updated, emails };
}

module.exports = {
  clientConfig, redirectUri, authUrl, handleCallback, disconnect,
  syncOnce, buildItems, parseAddressList, decodeMimeWords
};
