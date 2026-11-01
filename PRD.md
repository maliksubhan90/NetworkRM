# NetworkRM — Product Requirements Document (PRD)

| | |
|---|---|
| Product | NetworkRM — Personal CRM for executives |
| Version | 1.0 |
| Status | Approved for build |
| Date | 2 November 2026 |

---

## 1. Overview

NetworkRM is a single-page web app (Node/Express + SQLite + vanilla JS SPA)
that connects to the user's Gmail through Google OAuth, scans messages, and
builds a categorized contact rolodex with per-person interaction history and
context. The design goal is **executive-grade simplicity**: visually calm,
information-dense only where it matters, zero required data entry.

This PRD details the product behavior, data model, API, and acceptance
criteria. The BRD covers business objectives; this document is the build spec.

## 2. Goals

- G1. Automatic, one-time Google connection (sign in / sign out).
- G2. Rolodex built entirely from Gmail scan (no manual paste required).
- G3. Reliable auto-categorization with user override + learning.
- G4. Running database of who/when/what for every contact.
- G5. Beautiful, calm, simple executive UI.

**Non-goals**: sending mail, multi-user, calendars, mobile apps, AI summaries (roadmap).

## 3. Personas

- **The Group CEO** — reads dashboards in seconds, re-enters relationships, expects zero data entry.
- **The EA / maintainer** — searches, edits context, fixes categories, prepares briefs.

## 4. User stories & acceptance criteria

### 4.1 Connect Gmail (automatic)

**US-1 — Sign in with Google**
As the CEO, I want to sign in to my Gmail once so the app can build my rolodex automatically.

- Given the app has Google credentials configured, when I open the Gmail page and click **Sign in with Google**, then Google's consent screen opens.
- When I grant read-only access, then I return to the app connected as my account.
- When I open the app again, my connection persists.
- Acceptance: connection state shows my Gmail address; the Gmail page shows Sync controls.

**US-2 — Sign out / disconnect**
As the CEO, I want to sign out so I can revoke access or switch accounts.

- When I click **Sign out**, the app clears tokens (and best-effort revokes the access token) and the UI returns to the not-connected state.
- Acceptance: no Gmail data can be synced after disconnect; error shown if Sync is attempted.

**US-3 — Configure credentials in-app**
As a maintainer, I want to paste my Google Client ID and Client Secret in Settings so the app can offer Sign in.

- When no credentials exist, the Settings → Gmail connection card shows empty fields.
- When I save both, the app stores them (secret stored, masked in UI) and the Gmail page shows Sign in.
- Acceptance: credentials persist; secret is never displayed back; leaving fields blank keeps saved values.

### 4.2 Sync & rolodex

**US-4 — Sync my mailbox**
As the CEO, I want to sync my mail so my network appears.

- When I click **Sync now**, the app scans the last 6 months (or since last sync) of mail in:anywhere, fetches message metadata, and ingests senders/recipients as contacts with email rows.
- When a sender is a no-reply/automation address, it is skipped.
- Acceptance: after sync, Contacts is populated; each contact has first/last interaction, count, last-conversation note; dashboard numbers update.

**US-5 — Idempotent re-sync**
As the CEO, I want to sync again without duplicates.

- When I sync twice with no new mail, then no duplicate emails or contacts appear; counters do not inflate.
- Acceptance: dedupe by (contact, date, subject); synced-count reflects only new emails.

**US-6 — Sample data never pollutes real data**
As the CEO, I want the demo contacts gone once I connect real mail.

- When the first real sync adds at least one email, all sample contacts are deleted automatically.
- When I prefer, I can click **Remove sample data** on the dashboard banner or in Settings.
- Acceptance: after real sync, Contacts contains only real people; dashboard banner disappears.

### 4.3 Categorization

**US-7 — Automatic categories**
As the CEO, I want each contact tagged automatically.

- Categories: Clients, Internal team, Investors, Partners, Vendors, Subscriptions, Other.
- Priority: learned hint (email or domain) → work-domain rule (internal team) → keyword scoring over recent subjects/snippets.
- Acceptance: sample and real syncs produce sensible buckets; e.g., order/receipt mail lands in Subscriptions; own-domain mail lands in Internal team.

**US-8 — Override and remember**
As the CEO, I want to fix a category and have the app learn it.

- When I change a contact's category, the app stores a hint for that domain.
- When future syncs encounter the same domain, the hint wins.
- Acceptance: changing AliExpress Affiliate to Subscriptions once keeps future AliExpress mail in Subscriptions.

### 4.4 Views

**US-9 — Dashboard**
As the CEO, I want a five-second overview.

- Shows: total contacts, interactions in last 30 days, categories in use, need-a-nudge count (no contact in 60 days).
- Shows: stale contacts list with Reach out, recent activity feed, category breakdown bars.
- Shows: sample-data banner when applicable.
- Acceptance: all numbers derive from live stats; Reach out opens Gmail compose.

**US-10 — Contacts list**
As the CEO, I want to scan and search my network.

- Table columns: Contact (avatar, name, email, company), Category, Last interaction, Emails, **Last conversation**, notes dot.
- Search by name/email/company/title; filter by category pills.
- Acceptance: hover on a truncated last-conversation cell shows full text; rows open the contact page.

**US-11 — Contact detail**
As the CEO, I want everything about a person in one place.

- Header: avatar, name, email, category badge + override select, **Email** and **Copy** buttons.
- **Last conversation** card with the auto note and relative time.
- Meta row: last interaction, first seen, domain.
- Profile: Company, Role, Context, Notes (Context/Notes never overwritten by sync).
- Email history: reverse-chronological list with in/out direction, subject, snippet, time.
- Acceptance: Email opens Gmail compose (with copy fallback if popups blocked); Copy copies the address.

### 4.5 Settings

**US-12 — Identity & database**
As a maintainer, I want to set identity, work domains, and reset.

- Profile: name, email, work domain(s).
- Database: Reset demo data (clears contacts/emails/hints/settings, reseeds samples, disconnects Gmail); Remove sample contacts.
- Acceptance: work-domain list controls Internal-team tagging; reset behaves as described.

## 5. Feature specifications

### 5.1 Gmail integration (server: `lib/gmail.js`)

**OAuth flow**
- `GET /api/gmail/start` → 302 to Google consent with scopes
  `gmail.readonly`, `userinfo.email`, `userinfo.profile`; `access_type=offline`,
  `prompt=consent`, one-time `state` stored with a 10-minute expiry.
- `GET /api/gmail/callback` → validates state, exchanges code for tokens,
  fetches profile, saves account + refresh token, auto-adds the account's
  domain to work-domain list (internal team).
- Tokens: access token (short-lived, auto-refreshed) + refresh token stored
  in settings; refresh when within 60s of expiry.
- Disconnect: best-effort token revocation via Google's revoke endpoint, then
  clears all Gmail settings.

**Sync** (`syncOnce`)
- Query: `in:anywhere after:<since>` — 180 days on first sync, last hour before
  previous sync thereafter (dedupe protects the gap).
- Fetch message IDs in pages of 100 (cap: configurable, default 400, max 1200);
  fetch each as `format=metadata` (From, To, Cc, Subject, Date).
- Build items: for inbound mail, the sender becomes the contact; for outbound
  mail, recipients (To + Cc) become contacts with direction `out`.
- Skip: your own address, no-reply/automation addresses
  (no-reply, donotreply, postmaster, bounce, alert, etc.).
- Headers are RFC 2047-decoded; addresses parsed for `Name <email>` forms.
- After a successful sync with new mail, sample contacts are removed.

### 5.2 Data model (`lib/db.js`, SQLite)

**contacts**
| Column | Notes |
|---|---|
| id | PK autoincrement |
| name | Display name |
| email | UNIQUE, normalized lowercase |
| domain | Company domain (for hints) |
| company / title | Editable profile |
| category | clients/team/investors/partners/vendors/subscriptions/other |
| notes / context | Free text, never overwritten by sync |
| last_context | Auto note: newest email subject + snippet |
| first_seen / last_interaction | ISO timestamps |
| interaction_count | Email rows count |
| sample | 1 for demo contacts |
| created_at | ISO |

**emails** — id, contact_id FK, direction (in/out), subject, snippet, at.
Dedupe key: unique (contact_id, at, subject).

**imports** — sync/import audit log (source, detail, counts).

**settings** — key/value; identity, work_domain, Gmail tokens/account/state.

**category_hints** — hint (email or domain) → category, learned from overrides.

### 5.3 Categorization (`lib/categorize.js`)

- Keyword sets per category; multi-word phrases weigh more.
- Priority: hint (exact email, then domain) → work-domain match → keyword score.
- Subscriptions keywords capture transactional mail: order confirmation,
  receipt, billing, payment received, renewal, subscription, shipping update,
  monthly/annual plan, trial, payment failed.

### 5.4 API surface (`server.js`)

| Method | Path | Purpose |
|---|---|---|
| GET | /api/stats | Dashboard numbers |
| GET | /api/categories | Category counts |
| GET | /api/contacts?category=&q= | List/search |
| GET | /api/contacts/:id | Contact + emails |
| POST | /api/contacts | Add contact |
| PATCH | /api/contacts/:id | Update profile/category/notes |
| POST | /api/import/preview | Predict categories before save |
| POST | /api/import | Bulk import (secondary path) |
| GET | /api/demo | Sample mailbox messages |
| GET/PATCH | /api/settings | Identity/work-domain |
| POST | /api/reset | Wipe + reseed samples |
| POST | /api/samples/clear | Remove sample contacts only |
| GET | /api/gmail/status | Connection + sync state |
| POST | /api/gmail/config | Save Client ID/Secret |
| GET | /api/gmail/start | Start OAuth |
| GET | /api/gmail/callback | OAuth callback |
| POST | /api/gmail/sync | Run sync |
| POST | /api/gmail/disconnect | Sign out |

## 6. Edge cases

- **No credentials configured** → Gmail page shows setup prompt; Start returns 400 with a clear message.
- **Expired OAuth state** → callback rejected with "sign-in link expired"; user re-clicks Sign in.
- **Token revoked/expired beyond refresh** → sync returns clear error; status shows error state; re-sign-in required.
- **No-reply senders** → skipped entirely (never pollute the rolodex).
- **Sender == self** → outbound mail attributed to recipients instead.
- **Duplicate messages across syncs** → dedupe by (contact, date, subject).
- **Empty search / no matches** → friendly empty state with a CTA to Connect Gmail.
- **Contact with zero emails** → "No email yet" state; last-conversation column shows a dash.
- **Sample data present + real sync** → samples removed automatically.
- **Popup blocked on Email button** → copy fallback with a toast.
- **Port 3000 busy locally** → server logs the chosen PORT env; README documents PORT.

## 7. Design & UX principles

1. **Five-second dashboard** — the three questions (who/when/what) answerable at a glance.
2. **Calm visual language** — light neutrals, one confident indigo accent, generous space.
3. **No empty chores** — no manual import needed; no mandatory fields; sample data clearly marked and removable.
4. **Data with a pulse** — relative times, badges, colored category dots; numbers over charts.
5. **Progressive disclosure** — list → detail → edit; nothing hidden behind menus.

See `docs/BRANDING.md` for the full visual specification.

## 8. Metrics & instrumentation

- Sync runs: scanned, added, updated, emails (stored in imports log).
- Stats endpoint powers all dashboard numbers; recent activity shows the last 8 emails.
- Manual overrides are observable via category_hints growth.

## 9. Roadmap (future)

- AI context summaries per contact (beyond keyword notes).
- Calendar/meeting awareness for richer interaction history.
- Digest emails or briefs before key meetings.
- Export (CSV) of the rolodex.
- Multi-account support.

---

*PRD is the source of truth for behavior; code changes land in git with the docs.*
