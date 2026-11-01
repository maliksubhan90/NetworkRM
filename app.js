'use strict';

/* NetworkRM single-page app — executive edition */

const CATEGORY_META = {
  clients:   { label: 'Clients' },
  team:      { label: 'Internal team' },
  investors: { label: 'Investors' },
  partners:  { label: 'Partners' },
  vendors:   { label: 'Vendors' },
  subscriptions: { label: 'Subscriptions' },
  other:     { label: 'Other' }
};

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function relTime(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'never';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return fmtDate(iso);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(name, email) {
  const src = (name && name.trim()) ? name : email;
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  const take = parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return take || '?';
}

function badge(category) {
  const meta = CATEGORY_META[category] || CATEGORY_META.other;
  return `<span class="badge badge-${esc(category || 'other')}">${esc(meta.label)}</span>`;
}

function avatar(name, email, category, large) {
  return `<div class="avatar avatar-${esc(category || 'other')}${large ? ' avatar-lg' : ''}">${esc(initials(name, email))}</div>`;
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    let detail = 'Request failed';
    try { detail = (await res.json()).error || detail; } catch (e) { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

function loading(rows = 2) {
  let out = '';
  for (let i = 0; i < rows; i++) {
    out += `<div class="card loading-card"><div class="skel w60"></div><div class="skel w90" style="margin-top:10px"></div><div class="skel w35" style="margin-top:8px"></div></div>`;
  }
  return out;
}

/* ---------------- Router ---------------- */

function route() {
  const hash = (location.hash || '#/dashboard').replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  const page = parts[0] || 'dashboard';
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
  if (page === 'dashboard') return renderDashboard();
  if (page === 'contacts') return renderContacts();
  if (page === 'contact' && parts[1]) return renderContact(parts[1]);
  if (page === 'gmail') return renderGmail();
  if (page === 'settings') return renderSettings();
  return renderDashboard();
}

window.addEventListener('hashchange', route);

/* ---------------- Gmail helpers ---------------- */

let gmailStatusCache = null;

async function fetchGmailStatus() {
  try {
    gmailStatusCache = await api('/api/gmail/status');
  } catch (e) {
    gmailStatusCache = { connected: false, configured: false, syncState: 'idle' };
  }
  return gmailStatusCache;
}

// Connected and stale by more than 6 hours -> refresh silently.
function maybeAutoSync() {
  const st = gmailStatusCache;
  if (!st || !st.connected || st.syncState === 'running') return;
  const last = st.lastSync ? new Date(st.lastSync).getTime() : 0;
  if (!last || Date.now() - last > 6 * 3600 * 1000) {
    App.gmailSync(true);
  }
}

async function refreshNav() {
  const st = await fetchGmailStatus();
  const dot = $('#navGmailDot');
  if (dot) {
    dot.className = 'nav-dot';
    if (st.syncState === 'running') dot.classList.add('run');
    else if (st.connected && st.lastError) dot.classList.add('err');
    else if (st.connected) dot.classList.add('on');
  }
  const footDot = $('#footDot');
  const footLabel = $('#footLabel');
  const footSync = $('#footSync');
  if (footDot && footLabel && footSync) {
    footDot.className = 'sync-dot';
    if (st.syncState === 'running') { footDot.classList.add('run'); footLabel.textContent = 'Syncing Gmail…'; }
    else if (st.connected && st.lastError) { footDot.classList.add('err'); footLabel.textContent = 'Gmail · sync error'; }
    else if (st.connected) { footDot.classList.add('on'); footLabel.textContent = 'Gmail · ' + (st.account || 'connected'); }
    else if (st.configured) { footLabel.textContent = 'Gmail · not connected'; }
    else { footLabel.textContent = 'Gmail · set up'; }
    footSync.textContent = st.connected ? 'Sync' : 'Connect';
    footSync.style.display = 'inline-block';
    footSync.onclick = () => st.connected ? App.gmailSync(false) : (location.hash = '#/gmail');
  }
  try {
    const cats = await api('/api/categories');
    const total = Object.values(cats.counts).reduce((a, b) => a + b, 0);
    const el = $('#navContacts');
    if (el) el.textContent = total;
  } catch (e) { /* ignore */ }
}

/* ---------------- Overview ---------------- */

async function renderDashboard() {
  const view = $('#view');
  view.innerHTML = loading(2);
  let data, st;
  try {
    [data, st] = await Promise.all([api('/api/stats'), fetchGmailStatus()]);
  } catch (e) {
    view.innerHTML = `<div class="card card-pad empty">Could not load data: ${esc(e.message)}</div>`;
    return;
  }

  const cats = Object.entries(data.byCategory).filter(([, n]) => n > 0);
  const maxCat = Math.max(1, ...cats.map(c => c[1]));
  const connected = !!st.connected;

  const staleHtml = data.stale.length
    ? `<ul class="timeline">
       ${data.stale.map(c => `
         <li>
           <span class="timeline-dot in" style="background:var(--c-partners)"></span>
           <div class="timeline-main">
             <div class="timeline-person">${avatar(c.name, c.email, c.category)}<div><div class="timeline-subject">${esc(c.name || c.email)}</div><div class="timeline-meta">Last contact ${relTime(c.last_interaction)}</div></div></div>
           </div>
           <a class="btn btn-sm" href="mailto:${esc(c.email)}">Reach out</a>
         </li>`).join('')}
       </ul>`
    : `<div class="empty" style="padding:26px 12px"><h3>Nothing stale</h3><p>Everyone was in touch in the last 60 days.</p></div>`;

  const recentHtml = data.recent.length
    ? `<ul class="timeline">
       ${data.recent.map(r => `
         <li>
           <span class="timeline-dot ${r.direction === 'out' ? 'out' : 'in'}"></span>
           <div class="timeline-main">
             <div class="timeline-person">${avatar(r.name, r.email, r.category)}<div><div class="timeline-subject">${esc(r.subject || '(no subject)')}</div><div class="timeline-meta">${esc(r.direction === 'out' ? 'You → ' + (r.name || r.email) : r.name || r.email)} · ${fmtDateTime(r.at)}</div></div></div>
           </div>
           <a class="btn btn-sm" href="#/contact/${r.contact_id}">Open</a>
         </li>`).join('')}
       </ul>`
    : `<div class="empty"><h3>No activity yet</h3><p>Connect Gmail and your conversations will appear here.</p></div>`;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Overview</h1>
        <p>Who you talk to, when you last talked, and what needs your attention.</p>
      </div>
      <div class="head-actions">
        ${connected
          ? `<button class="btn btn-primary" onclick="App.gmailSync(false)" id="dashSync">${st.syncState === 'running' ? '<span class="spin"></span> Syncing…' : 'Sync now'}</button>`
          : `<a class="btn btn-primary" href="#/gmail">Connect Gmail</a>`}
      </div>
    </div>

    ${!connected ? `
      <div class="hero" style="margin-bottom:16px">
        <div>
          <h2>Connect Gmail — your rolodex builds itself</h2>
          <p>Every person you email becomes a contact. Categories, last interaction and context are filled in automatically.</p>
          <ul class="hero-bullets">
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Contacts appear from real conversations, not manual entry</li>
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Tagged automatically: clients, team, investors, partners, vendors</li>
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Always current — last interaction refreshes with every sync</li>
          </ul>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/gmail" style="font-size:13.5px;padding:11px 20px">Connect Gmail</a>
          <span class="hero-note">Read-only access. You sign in once with Google and can disconnect anytime.</span>
        </div>
      </div>` : ''}

    ${data.sampleCount > 0 ? `
    <div class="sample-banner">
      <span><b>${data.sampleCount}</b> sample contacts from the demo are mixed into your network. Remove them to keep only real people.</span>
      <button class="btn btn-sm btn-ghost" onclick="App.clearSamples()">Remove sample data</button>
    </div>` : ''}

    <div class="stat-grid">
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="7.5" r="3.1"/><path d="M4.5 16.5c.7-2.9 2.9-4.7 5.5-4.7s4.8 1.8 5.5 4.7"/></svg></div><span class="stat-label">Contacts</span></div>
        <div class="stat-value">${data.total}</div><div class="stat-sub">in your rolodex</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="14" height="11" rx="2"/><path d="m4 6.5 6 4.5 6-4.5"/></svg></div><span class="stat-label">Interactions</span></div>
        <div class="stat-value">${data.interactions30d}</div><div class="stat-sub">last 30 days</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6.5" cy="6.5" r="2.4"/><circle cx="13.5" cy="6.5" r="2.4"/><circle cx="6.5" cy="13.5" r="2.4"/><circle cx="13.5" cy="13.5" r="2.4"/></svg></div><span class="stat-label">Categories</span></div>
        <div class="stat-value">${cats.length}</div><div class="stat-sub">${cats.map(([c]) => esc(CATEGORY_META[c].label)).join(' · ')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-ico" style="background:rgba(217,119,6,.12);color:var(--warn)"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 5.5v4l2.5 1.5"/><circle cx="10" cy="10" r="6.5"/></svg></div><span class="stat-label">Needs a nudge</span></div>
        <div class="stat-value" style="${data.stale.length ? `color:var(--warn)` : ''}">${data.stale.length}</div><div class="stat-sub">no contact in 60 days</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h3 style="margin:0 0 4px">Needs a nudge</h3>
        <p class="hint" style="margin:0 0 6px">Relationships worth a check-in.</p>
        ${staleHtml}
      </div>
      <div class="card card-pad">
        <h3 style="margin:0 0 4px">Recent activity</h3>
        <p class="hint" style="margin:0 0 6px">Latest conversations from your mailbox.</p>
        ${recentHtml}
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h3 style="margin:0 0 12px">Your network by category</h3>
        ${cats.length ? cats.map(([cat, n]) => `
          <div class="cat-row">
            <span class="name">${esc(CATEGORY_META[cat].label)}</span>
            <div class="cat-bar-track"><div class="cat-bar" style="width:${Math.max(5, Math.round(n / maxCat * 100))}%;background:var(--c-${cat})"></div></div>
            <span class="num">${n}</span>
          </div>`).join('') : '<p class="hint">No contacts yet.</p>'}
      </div>
      <div class="card card-pad">
        <h3 style="margin:0 0 12px">Data source</h3>
        ${connected ? `
          <div class="timeline-person">${avatar(st.accountName || st.account, st.account, 'team')}<div><div class="timeline-subject">Gmail · ${esc(st.account)}</div><div class="timeline-meta">Last synced ${st.lastSync ? relTime(st.lastSync) : 'never'} · ${st.syncedCount} emails pulled</div></div></div>
          <div style="margin-top:12px"><a class="btn btn-sm btn-soft" href="#/gmail">Manage Gmail</a></div>` : `
          <div class="timeline-person">${avatar('', 'not@connected', 'other')}<div><div class="timeline-subject">No mailbox connected</div><div class="timeline-meta">Sample data is shown until you connect</div></div></div>
          <div style="margin-top:12px"><a class="btn btn-sm btn-soft" href="#/gmail">Connect Gmail</a></div>`}
        ${data.recentImports.length ? `
          <div class="divider"></div>
          <p class="hint" style="margin:0">Last import: ${esc(data.recentImports[0].source)} · ${esc(data.recentImports[0].detail)}</p>` : ''}
      </div>
    </div>`;

  if (connected) maybeAutoSync();
}

/* ---------------- Contacts ---------------- */

let contactState = { q: '', category: '', all: [], counts: {} };

async function renderContacts() {
  const view = $('#view');
  view.innerHTML = loading(2);
  let all, cats;
  try {
    [all, cats] = await Promise.all([api('/api/contacts'), api('/api/categories')]);
  } catch (e) {
    view.innerHTML = `<div class="card card-pad empty">Could not load contacts: ${esc(e.message)}</div>`;
    return;
  }
  contactState.all = all;
  contactState.counts = cats.counts;

  const filtered = all.filter(c => {
    if (contactState.category && c.category !== contactState.category) return false;
    if (contactState.q) {
      const q = contactState.q.toLowerCase();
      const hay = `${c.name} ${c.email} ${c.company} ${c.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const pills = ['', ...Object.keys(CATEGORY_META)].map(cat => `
    <button class="pill ${contactState.category === cat ? 'active' : ''}" onclick="App.filterCategory('${cat}')">
      ${cat ? esc(CATEGORY_META[cat].label) : 'All'}
      <span class="count">${cat ? contactState.counts[cat] || 0 : all.length}</span>
    </button>`).join('');

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Contacts</h1>
        <p>${all.length} people in your network${filtered.length !== all.length ? `, ${filtered.length} shown` : ''}</p>
      </div>
      <div class="head-actions">
        <button class="btn" onclick="App.toggleNewContact()">Add contact</button>
      </div>
    </div>

    <div id="newContactForm" style="display:none;margin-bottom:14px" class="card card-pad">
      <div style="display:grid;grid-template-columns:1fr 1.4fr auto;gap:12px;align-items:end">
        <div class="field" style="margin:0"><label>Name</label><input class="input" id="ncName" placeholder="Jane Smith" /></div>
        <div class="field" style="margin:0"><label>Email</label><input class="input" id="ncEmail" placeholder="jane@company.com" /></div>
        <button class="btn btn-primary" onclick="App.addContact()">Add</button>
      </div>
    </div>

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
      <div class="search-wrap" style="width:260px">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
        <input class="input" id="contactSearch" placeholder="Search name, email, company" value="${esc(contactState.q)}" oninput="App.searchContacts(this.value)" />
      </div>
      <div class="pill-row">${pills}</div>
    </div>

    <div class="card table-wrap">
      ${filtered.length ? `
      <table class="table">
        <thead><tr><th>Contact</th><th>Category</th><th>Last interaction</th><th>Emails</th><th></th></tr></thead>
        <tbody>
          ${filtered.map(c => `
            <tr onclick="location.hash='#/contact/${c.id}'">
              <td><div class="cell-contact">${avatar(c.name, c.email, c.category)}<div><div class="cell-name">${esc(c.name || c.email)}</div><div class="cell-sub">${esc(c.email)}${c.company ? ' · ' + esc(c.company) : ''}</div></div></div></td>
              <td>${badge(c.category)}</td>
              <td class="nowrap mono">${relTime(c.last_interaction)}</td>
              <td class="mono">${c.interaction_count || 0}</td>
              <td class="td-right"><span class="hint" style="margin:0">${c.notes ? '●' : ''}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>` : `
      <div class="empty">
        <div class="empty-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="7.5" r="3.1"/><path d="M4.5 16.5c.7-2.9 2.9-4.7 5.5-4.7s4.8 1.8 5.5 4.7"/></svg></div>
        <h3>No contacts match</h3>
        <p>Try a different search, or connect Gmail to build the rolodex automatically.</p>
        <a class="btn btn-primary" href="#/gmail">Connect Gmail</a>
      </div>`}
    </div>`;
}

/* ---------------- Contact detail ---------------- */

async function renderContact(id) {
  const view = $('#view');
  view.innerHTML = loading(1);
  let data;
  try { data = await api('/api/contacts/' + id); } catch (e) {
    view.innerHTML = `<div class="card card-pad empty">${esc(e.message)}</div>`;
    return;
  }
  const c = data.contact;
  const emails = data.emails;

  view.innerHTML = `
    <a class="back" href="#/contacts">← All contacts</a>
    <div class="detail-head">
      ${avatar(c.name, c.email, c.category, true)}
      <div>
        <h1 class="detail-name">${esc(c.name || c.email)}</h1>
        <div class="detail-sub">${esc(c.email)}</div>
        <div class="detail-chips">${badge(c.category)}</div>
      </div>
      <div class="detail-actions">
        <a class="btn" href="mailto:${esc(c.email)}">Email</a>
        <button class="btn" onclick="App.copyEmail('${esc(c.email)}')">Copy</button>
        <select class="select" onchange="App.setCategory(${c.id}, this.value)">
          ${Object.entries(CATEGORY_META).map(([k, m]) => `<option value="${k}" ${k === c.category ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:14px">
      <div class="head-row" style="margin:0">
        <div>
          <h3 style="margin:0;font-size:14.5px">Last conversation</h3>
          <p class="hint" style="margin:2px 0 0">${c.last_context ? esc(c.last_context) : 'No email yet for this contact.'}</p>
        </div>
        ${c.last_interaction ? `<span class="hint nowrap">${relTime(c.last_interaction)}</span>` : ''}
      </div>
    </div>

    <div class="meta-row">
      <div class="card meta-mini"><div class="meta-label">Last interaction</div><div class="meta-value">${relTime(c.last_interaction)}</div><div class="meta-sub">${fmtDate(c.last_interaction)}</div></div>
      <div class="card meta-mini"><div class="meta-label">First seen</div><div class="meta-value">${fmtDate(c.first_seen) || '—'}</div><div class="meta-sub">${c.interaction_count || 0} emails total</div></div>
      <div class="card meta-mini"><div class="meta-label">Domain</div><div class="meta-value" style="font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.domain || '—')}</div><div class="meta-sub">Used for auto-categorizing</div></div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h3 style="margin:0 0 14px">Profile</h3>
        <div class="grid-2-1">
          <div class="field"><label>Company</label><input class="input" id="fCompany" value="${esc(c.company)}" placeholder="Company name" /></div>
          <div class="field"><label>Role</label><input class="input" id="fTitle" value="${esc(c.title)}" placeholder="Role or title" /></div>
        </div>
        <div class="field"><label>Context</label><textarea class="textarea" id="fContext" placeholder="What do you remember about this person? Deals, projects, shared history.">${esc(c.context)}</textarea><div class="hint">Free text. Never overwritten by synced email.</div></div>
        <div class="field"><label>Notes</label><textarea class="textarea" id="fNotes" placeholder="Next steps, personal details, reminders">${esc(c.notes)}</textarea></div>
        <button class="btn btn-primary" onclick="App.saveContact(${c.id})">Save changes</button>
      </div>
      <div class="card card-pad">
        <h3 style="margin:0 0 4px">Email history</h3>
        <p class="hint" style="margin:0 0 8px">${emails.length} messages in the database</p>
        ${emails.length ? `
        <ul class="timeline">
          ${emails.map(e => `
            <li>
              <span class="timeline-dot ${e.direction === 'out' ? 'out' : 'in'}"></span>
              <div class="timeline-main">
                <div class="timeline-subject">${esc(e.subject || '(no subject)')}</div>
                <div class="timeline-meta">${e.direction === 'out' ? 'Sent by you' : 'Received'} · ${fmtDateTime(e.at)}</div>
                ${e.snippet ? `<div class="timeline-snippet">${esc(e.snippet)}</div>` : ''}
              </div>
            </li>`).join('')}
        </ul>` : `<div class="empty"><h3>No email yet</h3><p>Sync Gmail or import mail to attach conversations.</p></div>`}
      </div>
    </div>`;
}

/* ---------------- Gmail ---------------- */

async function renderGmail() {
  const view = $('#view');
  view.innerHTML = loading(1);
  let st;
  try { st = await fetchGmailStatus(); } catch (e) {
    view.innerHTML = `<div class="card card-pad empty">Could not load Gmail status: ${esc(e.message)}</div>`;
    return;
  }

  const connected = !!st.connected;
  const running = st.syncState === 'running';

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Gmail</h1>
        <p>Connect your mailbox once — NetworkRM keeps your rolodex current automatically.</p>
      </div>
      ${connected ? `<div class="head-actions"><button class="btn btn-primary" onclick="App.gmailSync(false)" id="gmailSyncBtn">${running ? '<span class="spin"></span> Syncing…' : 'Sync now'}</button></div>` : ''}
    </div>

    ${connected ? `
      <div class="card connect-card">
        <div class="connect-avatar">${esc(initials(st.accountName, st.account))}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="connect-name">${esc(st.accountName || st.account)}</div>
            <span class="connected-pill">Connected · read-only</span>
          </div>
          <div class="connect-sub">${esc(st.account)}</div>
          ${st.lastSync ? `<div class="hint" style="margin-top:8px">Last synced ${relTime(st.lastSync)}${st.lastDetail ? ' · ' + esc(st.lastDetail) : ''} · ${st.syncedCount} emails pulled in total</div>` : `<div class="hint" style="margin-top:8px">Connected. Run your first sync to build the rolodex.</div>`}
        </div>
        <div style="display:flex;gap:8px;flex-direction:column;align-items:stretch;flex:none">
          <button class="btn btn-soft" onclick="App.gmailSync(false)">${running ? 'Syncing…' : 'Sync now'}</button>
          <button class="btn btn-danger" onclick="App.gmailDisconnect()">Disconnect</button>
        </div>
      </div>
      ${st.lastError ? `<div class="error-note">Last sync failed: ${esc(st.lastError)}</div>` : ''}
      <div class="meta-row">
        <div class="card meta-mini"><div class="meta-label">Emails pulled</div><div class="meta-value">${st.syncedCount}</div><div class="meta-sub">across all syncs</div></div>
        <div class="card meta-mini"><div class="meta-label">Auto-sync</div><div class="meta-value">On</div><div class="meta-sub">Refreshes when you open the app and are 6h+ stale</div></div>
        <div class="card meta-mini"><div class="meta-label">Scope</div><div class="meta-value">Read-only</div><div class="meta-sub">NetworkRM never sends or edits your mail</div></div>
      </div>
      <div class="card card-pad" style="margin-top:16px">
        <h3 style="margin:0 0 6px">What happens on sync</h3>
        <p class="hint" style="margin:0 0 10px">The last 6 months of mail are scanned in batches (400 messages per run). Every sender becomes a contact; subjects and snippets become interaction history; categories are scored automatically. Re-syncs only add new mail.</p>
        <div class="steps" style="margin:0">
          <div class="step" style="padding:0"><div class="step-k">1</div><h3>Scan</h3><p>Messages since your last sync are read — headers only, no attachments.</p></div>
          <div class="step" style="padding:0"><div class="step-k">2</div><h3>Build</h3><p>Contacts are created or merged by email address.</p></div>
          <div class="step" style="padding:0"><div class="step-k">3</div><h3>Categorize</h3><p>Clients, team, investors, partners and vendors are tagged for you.</p></div>
        </div>
      </div>
    ` : `
      ${!st.configured ? `
        <div class="card card-pad" style="max-width:720px;margin-bottom:16px">
          <h3 style="margin:0 0 6px">One-time setup: Google credentials</h3>
          <p class="hint" style="margin:0 0 14px">NetworkRM needs a Google OAuth client so it can ask permission to read your mailbox. This takes about 3 minutes, once:</p>
          <div class="steps" style="margin:0 0 18px">
            <div class="step"><div class="step-k">1</div><h3>Create a Google Cloud project</h3><p>At <a class="link" href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a>, create a project and enable the <b>Gmail API</b>.</p></div>
            <div class="step"><div class="step-k">2</div><h3>Make an OAuth client</h3><p>OAuth consent screen → add your Gmail as a test user. Credentials → Create credentials → OAuth client ID → <b>Web application</b>.</p></div>
            <div class="step"><div class="step-k">3</div><h3>Add the redirect URI</h3><p>In the client settings, add this exact URI:<br/><code style="font-size:11px">${esc(location.origin)}/api/gmail/callback</code></p></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field" style="margin:0"><label>Client ID</label><input class="input" id="gClientId" placeholder="1234567890-abc.apps.googleusercontent.com" /></div>
            <div class="field" style="margin:0"><label>Client Secret</label><input class="input" id="gClientSecret" type="password" placeholder="GOCSPX-…" /></div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
            <button class="btn btn-primary" onclick="App.gmailSaveConfig()">Save credentials</button>
            <span class="hint" style="margin:0">Stored in this app's own database. Never shown again after saving.</span>
          </div>
        </div>` : ''}
      <div class="hero">
        <div>
          <h2>Connect Gmail — your rolodex builds itself</h2>
          <p>Every person you email becomes a contact. Categories, last interaction and context are filled in automatically.</p>
          <ul class="hero-bullets">
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Contacts appear from real conversations, not manual entry</li>
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Tagged automatically: clients, team, investors, partners, vendors</li>
            <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.5 4 4 8-9"/></svg>Always current — last interaction refreshes with every sync</li>
          </ul>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/api/gmail/start" style="font-size:13.5px;padding:11px 20px">Sign in with Google</a>
          <span class="hero-note">Read-only access to your Gmail. You can disconnect at any time from this page.</span>
        </div>
      </div>
    `}

    <div class="section-title">Or bring in email another way</div>
    <details class="card">
      <summary>Import from files or pasted email</summary>
      <div class="details-body">
        <div class="grid-2-1">
          <div class="card" style="box-shadow:none;border-color:var(--border);padding:14px">
            <h3 style="margin:0 0 10px">From a file</h3>
            <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
              <div class="dropzone-title">Choose .eml, .mbox or .txt files</div>
              <div class="dropzone-sub">Gmail Takeout exports are .mbox files inside the zip. Drag files here or click to browse.</div>
            </div>
            <input type="file" id="fileInput" multiple accept=".eml,.mbox,.txt" style="display:none" onchange="App.onFiles(this.files)" />
          </div>
          <div class="card" style="box-shadow:none;border-color:var(--border);padding:14px">
            <h3 style="margin:0 0 10px">Or paste a message</h3>
            <textarea class="textarea" id="pasteBox" style="min-height:120px" placeholder="Paste a full email here, headers and all. Or load the sample mailbox below."></textarea>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary" onclick="App.pasteParse()">Parse pasted text</button>
              <button class="btn" onclick="App.sampleParse()">Load sample mailbox</button>
            </div>
          </div>
        </div>
        <div id="previewWrap" style="margin-top:14px"></div>
      </div>
    </details>`;

  if (connected) maybeAutoSync();
}

/* ---------------- Settings ---------------- */

async function renderSettings() {
  const view = $('#view');
  view.innerHTML = loading(1);
  let s, st;
  try {
    [s, st] = await Promise.all([api('/api/settings'), fetchGmailStatus()]);
  } catch (e) {
    view.innerHTML = `<div class="card card-pad empty">${esc(e.message)}</div>`;
    return;
  }

  view.innerHTML = `
    <div class="page-head"><h1>Settings</h1><p>Identity, Gmail connection and database controls.</p></div>

    <div class="card card-pad" style="max-width:640px">
      <h3 style="margin:0 0 14px">Your profile</h3>
      <div class="grid-2-1">
        <div class="field"><label>Your name</label><input class="input" id="sName" value="${esc(s.name)}" /></div>
        <div class="field"><label>Your email</label><input class="input" id="sEmail" value="${esc(s.email)}" /></div>
      </div>
      <div class="field"><label>Work domain(s)</label><input class="input" id="sDomain" value="${esc(s.work_domain)}" placeholder="mycompany.com" /><div class="hint">Comma-separated. Senders from these domains are tagged Internal team automatically. Your connected Gmail domain is added on its own.</div></div>
      <button class="btn btn-primary" onclick="App.saveSettings()">Save profile</button>
    </div>

    <div class="card card-pad" style="max-width:640px;margin-top:16px">
      <h3 style="margin:0 0 6px">Gmail connection</h3>
      <p class="hint" style="margin:0 0 12px">${st.connected
        ? `Connected as <b>${esc(st.account)}</b>. Disconnect or re-sync from the <a class="link" href="#/gmail">Gmail page</a>.`
        : st.viaEnv
          ? 'Gmail credentials are provided by the deployment environment.'
          : st.configured
            ? 'Google credentials are saved. Go to the <a class="link" href="#/gmail">Gmail page</a> to connect.'
            : 'No Google credentials yet. Add them on the <a class="link" href="#/gmail">Gmail page</a>.'}</p>
      ${!st.viaEnv ? `
        <div class="grid-2-1">
          <div class="field" style="margin:0"><label>Client ID ${st.clientIdMasked ? `· ${esc(st.clientIdMasked)}` : ''}</label><input class="input" id="gsClientId" placeholder="1234567890-abc.apps.googleusercontent.com" /></div>
          <div class="field" style="margin:0"><label>Client Secret ${st.secretConfigured ? '· saved' : ''}</label><input class="input" id="gsClientSecret" type="password" placeholder="GOCSPX-…" /></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn" onclick="App.gmailSaveConfig()">Update credentials</button>
          <span class="hint" style="margin:0">Leaving a field blank keeps the saved value.</span>
        </div>` : ''}
    </div>

    <div class="card card-pad" style="max-width:640px;margin-top:16px">
      <h3 style="margin:0 0 6px">Database</h3>
      <p class="hint" style="margin:0 0 12px">Everything lives in a local SQLite file on the app's storage. Reset clears contacts, email history and learned category hints, then reloads the sample mailbox. It also disconnects Gmail.</p>
      <button class="btn btn-danger" onclick="App.resetData()">Reset demo data</button>
    </div>

    <div class="card card-pad" style="max-width:640px;margin-top:16px">
      <h3 style="margin:0 0 6px">Sample data</h3>
      <p class="hint" style="margin:0 0 12px">Removes the demo contacts that came seeded on first run, leaving only contacts from your real Gmail sync and imports.</p>
      <button class="btn" onclick="App.clearSamples()">Remove sample contacts</button>
    </div>

    <div class="card card-pad" style="max-width:640px;margin-top:16px">
      <h3 style="margin:0 0 6px">About</h3>
      <p class="hint" style="margin:0">NetworkRM builds your rolodex from email — automatically categorizes every contact (clients, internal team, investors, partners, vendors), tracks when you last interacted, and keeps the context around each person. v2</p>
    </div>`;
}

/* ---------------- Actions ---------------- */

const App = {
  filterCategory(cat) { contactState.category = cat; renderContacts(); },

  searchContacts(v) { contactState.q = v; renderContacts(); },

  toggleNewContact() {
    const el = $('#newContactForm');
    if (el) el.style.display = el.style.display === 'none' ? 'grid' : 'none';
  },

  async addContact() {
    const name = $('#ncName').value.trim();
    const email = $('#ncEmail').value.trim();
    if (!email) return toast('Email is required');
    try {
      await api('/api/contacts', { method: 'POST', body: JSON.stringify({ name, email }) });
      toast('Contact added');
      $('#newContactForm').style.display = 'none';
      $('#ncName').value = '';
      $('#ncEmail').value = '';
      renderContacts();
      refreshNav();
    } catch (e) { toast(e.message); }
  },

  async setCategory(id, category) {
    try {
      await api('/api/contacts/' + id, { method: 'PATCH', body: JSON.stringify({ category }) });
      toast('Category updated');
      renderContact(id);
      refreshNav();
    } catch (e) { toast(e.message); }
  },

  async saveContact(id) {
    const body = {
      company: $('#fCompany').value,
      title: $('#fTitle').value,
      context: $('#fContext').value,
      notes: $('#fNotes').value
    };
    try {
      await api('/api/contacts/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      toast('Saved');
    } catch (e) { toast(e.message); }
  },

  copyEmail(email) {
    navigator.clipboard.writeText(email).then(() => toast('Email copied'), () => toast('Could not copy'));
  },

  async gmailSaveConfig() {
    const idEl = $('#gClientId') || $('#gsClientId');
    const secEl = $('#gClientSecret') || $('#gsClientSecret');
    if (!idEl || !secEl) return;
    const clientId = idEl.value.trim();
    const clientSecret = secEl.value.trim();
    if (!clientId || !clientSecret) return toast('Both Client ID and Client Secret are required');
    try {
      await api('/api/gmail/config', { method: 'POST', body: JSON.stringify({ clientId, clientSecret }) });
      toast('Gmail credentials saved');
      location.hash = '#/gmail';
      renderGmail();
    } catch (e) { toast(e.message); }
  },

  gmailConnect() { location.href = '/api/gmail/start'; },

  async gmailDisconnect() {
    if (!confirm('Disconnect Gmail? Contacts already built stay in your rolodex.')) return;
    try {
      await api('/api/gmail/disconnect', { method: 'POST' });
      toast('Gmail disconnected');
      await fetchGmailStatus();
      route();
      refreshNav();
    } catch (e) { toast(e.message); }
  },

  async gmailSync(silent) {
    if (gmailStatusCache && gmailStatusCache.syncState === 'running') return;
    if (!silent) toast('Syncing your mailbox…');
    try {
      const res = await api('/api/gmail/sync', { method: 'POST', body: JSON.stringify({}) });
      if (res.syncing) {
        // Another run is in progress; wait for it via polling.
        await this._pollSync();
      } else {
        gmailStatusCache = null;
        await fetchGmailStatus();
        toast(`Sync complete — ${res.added} new contacts, ${res.emails} emails`);
        if (location.hash.includes('gmail')) renderGmail();
        else route();
        refreshNav();
      }
    } catch (e) {
      if (e.message === 'Gmail is not connected.') return;
      toast('Sync failed: ' + e.message);
      gmailStatusCache = null;
      await fetchGmailStatus();
      if (location.hash.includes('gmail')) renderGmail();
      refreshNav();
    }
  },

  _pollSync() {
    return new Promise((resolve) => {
      const iv = setInterval(async () => {
        const st = await fetchGmailStatus();
        if (st.syncState !== 'running') {
          clearInterval(iv);
          const lastDetail = st.lastDetail || 'Sync complete';
          toast(lastDetail);
          if (location.hash.includes('gmail')) renderGmail();
          else route();
          refreshNav();
          resolve();
        }
      }, 2000);
      setTimeout(() => { clearInterval(iv); resolve(); }, 180000);
    });
  },

  /* ---- Manual import fallback ---- */

  onFiles(files) {
    const tasks = [...files].map(f => f.text().then(t => ({ name: f.name, text: t })));
    Promise.all(tasks).then(results => {
      const messages = [];
      for (const r of results) messages.push(...NetworkRMParser.parseEmailText(r.text));
      if (!messages.length) return toast('No email addresses found in those files');
      this.preview(messages, `file import (${files.length} file${files.length > 1 ? 's' : ''})`);
    }).catch(() => toast('Could not read those files'));
  },

  pasteParse() {
    const text = $('#pasteBox').value;
    const messages = NetworkRMParser.parseEmailText(text);
    if (!messages.length) return toast('No email addresses found. Paste full messages with headers.');
    this.preview(messages, 'pasted text');
  },

  async sampleParse() {
    toast('Loading sample mailbox');
    try {
      const res = await api('/api/demo');
      this.preview(res.messages, 'sample mailbox');
    } catch (e) { toast(e.message); }
  },

  async preview(messages, source) {
    this._lastMessages = messages;
    this._lastSource = source;
    let items;
    try {
      items = (await api('/api/import/preview', { method: 'POST', body: JSON.stringify({ messages }) })).items;
    } catch (e) { return toast(e.message); }
    const wrap = $('#previewWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="card card-pad">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px">
          <div>
            <h3 style="margin:0;font-size:15px">Ready to import</h3>
            <p class="hint" style="margin:2px 0 0">${items.length} contacts from ${messages.length} messages · source: ${esc(source)}</p>
          </div>
          <button class="btn btn-primary" onclick="App.applyImport()">Add ${items.length} to NetworkRM</button>
        </div>
        <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Contact</th><th>Predicted category</th><th>Messages</th><th>Recent subjects</th></tr></thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td><div class="cell-contact">${avatar(it.name, it.email, it.category)}<div><div class="cell-name">${esc(it.name || it.email)}</div><div class="cell-sub">${esc(it.email)}</div></div></div></td>
                <td>${badge(it.category)}</td>
                <td class="mono">${it.messageCount}</td>
                <td class="hint" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.sampleSubjects.join(' · '))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  },

  async applyImport() {
    const messages = this._lastMessages || [];
    if (!messages.length) return toast('Nothing to import. Parse email first.');
    const grouped = this.groupMessages(messages);
    try {
      const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ source: this._lastSource || 'manual', items: grouped }) });
      toast(`Added ${res.added} new contacts, ${res.emails} emails`);
      $('#previewWrap').innerHTML = '';
      location.hash = '#/contacts';
      refreshNav();
    } catch (e) { toast(e.message); }
  },

  groupMessages(messages) {
    const byEmail = new Map();
    for (const m of messages) {
      const key = String(m.fromEmail || m.from || '').toLowerCase();
      if (!key.includes('@')) continue;
      if (!byEmail.has(key)) byEmail.set(key, { name: m.fromName || '', email: key, emails: [] });
      byEmail.get(key).emails.push(m);
    }
    return [...byEmail.values()];
  },

  async saveSettings() {
    const body = {
      name: $('#sName').value,
      email: $('#sEmail').value,
      work_domain: $('#sDomain').value
    };
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
      toast('Profile saved');
      renderSettings();
    } catch (e) { toast(e.message); }
  },

  async clearSamples() {
    try {
      const res = await api('/api/samples/clear', { method: 'POST' });
      toast(res && res.ok ? 'Sample contacts removed' : 'Done');
      route();
      refreshNavCount();
    } catch (e) { toast(e.message); }
  },

  async resetData() {
    if (!confirm('Reset all data (including the Gmail connection) and reload the sample mailbox?')) return;
    try {
      await api('/api/reset', { method: 'POST' });
      toast('Demo data reset');
      gmailStatusCache = null;
      route();
      refreshNav();
    } catch (e) { toast(e.message); }
  }
};
window.App = App;

/* ---------------- Boot ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('connected') === '1' && location.hash === '#/gmail') {
    history.replaceState(null, '', '#/gmail');
    toast('Gmail connected. Running first sync…');
  }
  route();
  refreshNav();
});
