# NetworkRM — Business Requirements Document (BRD)

| | |
|---|---|
| Product | NetworkRM — Personal CRM for executives |
| Version | 1.0 |
| Status | Approved for build (Week 2 course project) |
| Date | 2 November 2026 |
| Owner | Group CEO / Executive Office |
| Author | Product & Engineering (assisted by Argus) |

---

## 1. Executive summary

NetworkRM is a personal CRM for a busy executive (Group CEO). It solves a
specific, expensive problem: the CEO's professional network is scattered
across years of email, and nobody can answer "who do I talk to, when did we
last talk, and what was it about?" without digging through a mailbox.

NetworkRM connects **automatically to Gmail**, scans recent mail, and builds
a clean, categorized rolodex — clients, internal team, investors, partners,
vendors, subscriptions and other. For every contact it keeps a running record
of first interaction, last interaction, interaction count, and an automatic
"last conversation" note so the CEO can re-enter any relationship in seconds.
Categorization is automatic, learnable (one manual override teaches the
system), and editable at any time.

The product is deliberately **simple and visually calm**: one glance at the
dashboard answers the three questions above. No data entry, no import
workflows, no configuration beyond a one-time Google connection.

## 2. Background & problem statement

Email is where the CEO's network actually lives: client relationships, board
updates, investor notes, partnership threads, vendor renewals, and hundreds
of one-off conversations. That history is:

- **Unstructured** — no single view of a person across threads.
- **Not queryable** — "who haven't I spoken to in 60 days?" requires manual recall.
- **Context-free** — a name in the address book says nothing about what was last discussed.
- **Fragmented** — tools that require manual import or paste fail in practice because busy people will not do data-entry work.

The client brief states the requirement plainly: the tool should
**automatically scan Gmail and build a categorized rolodex**, keeping a clean
running database of who the CEO communicates with, when they last interacted,
and the basic context around each person.

Manual import (pasting emails, uploading .mbox files) was explicitly rejected
by the client as "not ideal or optimal". The product must therefore be
**connection-first**: sign in to Gmail once, and the database builds itself.

## 3. Business objectives

| # | Objective | How it is measured |
|---|---|---|
| BO-1 | Automatic rolodex | Contacts created from Gmail with zero manual entry; first sync returns a populated Contacts page |
| BO-2 | Relationship freshness | "Needs a nudge" list identifies contacts untouched for 60+ days |
| BO-3 | Context at a glance | Every contact has an auto-generated last-conversation note plus editable context/notes |
| BO-4 | Reliable categorization | Clients/team/investors/partners/vendors/subscriptions tagged automatically with learnable overrides |
| BO-5 | Zero-friction adoption | One-time Google sign-in; no data-entry burden; dashboard readable in under 5 seconds |
| BO-6 | Trustworthy data | Deduplicated emails, idempotent re-syncs, local SQLite storage |

## 4. Stakeholders

| Stakeholder | Interest | Success looks like |
|---|---|---|
| Group CEO (primary user) | Know the network, re-enter relationships quickly | Opens app, sees who matters, last interaction, what it was about |
| Executive assistant / office | Maintains notes, fixes categories | Fast search, editable context, no manual import burden |
| Engineering (internal) | Maintainable, testable codebase | Clear architecture, documented API, runnable locally |
| Google (external dependency) | OAuth consent, Gmail API | Scoped read-only access, test-user flow, revocable tokens |

## 5. User personas

**Primary: "The Group CEO"**
- Time-poor, decision-heavy. Uses the app between meetings, on the go.
- Needs answers in seconds: Who is this? When did we last talk? What was the
  last conversation about? Do I need to reach out?
- Will not enter data. Will not read manuals. Will sign in to Google once.
- Judges the product by calm, simplicity and usefulness, not by features.

**Secondary: "The EA"**
- Delegated maintainer. Fixes categories, writes context notes, spots stale
  relationships, prepares the CEO's pre-meeting briefs.
- Values search, edit speed, and reliability of the underlying data.

## 6. Scope

### 6.1 In scope (v1)

- Automatic Gmail connection via Google Cloud OAuth (sign in / sign out).
- Gmail message scanning (read-only, gmail.readonly scope) and ingestion.
- Auto-built contact database with dedupe by email address.
- Auto-categorization into: Clients, Internal team, Investors, Partners,
  Vendors, Subscriptions, Other.
- Learnable category hints (one manual override teaches the domain).
- Dashboard: totals, category breakdown, recent activity, stale nudges.
- Contact detail: profile, editable context/notes, full email history.
- "Last conversation" auto-note per contact.
- Sample demo data on first run, with one-click removal and auto-removal on
  the first real sync.
- Settings: identity, work domain, Gmail credentials, database reset.
- Local execution (Node + SQLite) and a hosted deployment.

### 6.2 Out of scope (v1, future candidates)

- Sending/reply from within NetworkRM (read-only by design).
- Calendar, meetings, or tasks integration.
- Multi-user team features, shared team inboxes.
- AI-generated summaries beyond keyword-based notes (roadmap).
- Mobile apps (responsive web only in v1).

## 7. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | User can sign in to Gmail with Google OAuth from the app | Must |
| FR-2 | User can sign out / disconnect Gmail, revoking access | Must |
| FR-3 | App scans Gmail (read-only) and ingests senders/recipients as contacts | Must |
| FR-4 | Re-sync is idempotent — no duplicate emails or contacts | Must |
| FR-5 | Every contact has name, email, domain, category, first/last interaction, interaction count | Must |
| FR-6 | Auto-categorization by keyword scoring + work-domain rule + learned hints | Must |
| FR-7 | User can override a contact's category; the override is remembered for that domain | Must |
| FR-8 | Dashboard shows totals, 30-day interactions, category breakdown, stale list, recent activity | Must |
| FR-9 | Contact page shows full email history (direction, subject, snippet, time) | Must |
| FR-10 | Contact page shows an auto "Last conversation" note and editable Context/Notes | Must |
| FR-11 | Contacts list is searchable and filterable by category | Must |
| FR-12 | Contacts list includes a "Last conversation" column | Must |
| FR-13 | Email button opens Gmail compose for the contact; Copy button copies the address | Must |
| FR-14 | Sample demo data is marked and removable; auto-removed after first real sync | Should |
| FR-15 | Manual import (file/paste) remains available but is secondary | Should |
| FR-16 | Settings for identity, work domain, credentials, reset | Must |

## 8. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Performance | Dashboard and contact list load in under ~1s locally; sync of ~100 messages completes in seconds |
| NFR-2 | Security | OAuth tokens stored in the app's SQLite settings, never in git; credentials never printed to chat/logs; read-only Gmail scope only |
| NFR-3 | Privacy | Data lives in a local SQLite file; nothing leaves the machine except Google API calls the user authorized |
| NFR-4 | Usability | Executive-simple: no data entry required, primary flows visible from the first screen |
| NFR-5 | Reliability | Idempotent syncs; crashes do not corrupt the database (SQLite); app logs startup errors clearly |
| NFR-6 | Portability | Runs on Node 24 with zero external services (SQLite built in); no Python required at runtime |
| NFR-7 | Maintainability | Small, documented codebase (server, db, categorize, gmail, seed + SPA) |

## 9. Assumptions, constraints, dependencies

**Assumptions**
- The CEO has a Google account with Gmail and is willing to complete a
  one-time OAuth consent.
- The Google OAuth client is in Testing mode with the CEO's address added as
  a test user (or published to production after verification).
- Email volume in scope is a typical executive mailbox; scanning is capped
  per sync (default 400 messages, last 6 months).

**Constraints**
- OAuth requires a Google Cloud project with the Gmail API enabled and an
  authorized redirect URI that exactly matches the app's host.
- Hosted deployments cannot embed secrets in code; credentials are provided
  via deployment environment variables or the app's settings page.
- gmail.readonly means the app can read but never send or modify mail.

**Dependencies**
- Google Cloud Console (project, OAuth client, Gmail API).
- Google's OAuth endpoints and Gmail REST API.
- Node.js >= 18 (24 recommended) for `node:sqlite`.

## 10. Success metrics (KPIs)

1. **Time to first value**: minutes from opening the app to a populated rolodex (target: < 5 with a connected mailbox).
2. **Contacts synced without manual entry**: 100% of rolodex entries created by sync (excluding manual additions).
3. **Categorization accuracy**: % of contacts the CEO does NOT need to re-categorize (target: > 85%).
4. **Stale-contact recovery**: number of nudges acted on per month.
5. **Context coverage**: % of contacts with a last-conversation note (target: 100% after first sync).
6. **Adoption friction**: support tickets / setup questions per 10 users (target: < 1 after documentation).

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google 403 / consent-screen misconfiguration | High early | Blocks sign-in | Step-by-step README, test-user list, exact redirect URI checks, in-app diagnostics |
| Redirect URI mismatch between local and hosted | Medium | Sign-in fails on one surface | Document both URIs; single credential with multiple URIs |
| Keyword miscategorization | Medium | Wrong bucket | Editable categories + learned hints; Subscriptions category for transactional mail |
| Sample data polluting real view | Medium | Confusion | Sample flag, auto-removal on first real sync, manual remove button |
| Token expiry / revocation | Low | Sync fails | Automatic refresh-token flow; clear error states and reconnect path |

## 12. Timeline (indicative)

| Phase | Deliverable |
|---|---|
| Discovery & brief | Client feedback captured; manual import rejected; Gmail-first direction confirmed |
| Build v1 | Express + SQLite app, categorization, SPA UI |
| v2 — Gmail integration | OAuth sign-in/sign-out, Gmail scan, sync pipeline, token storage |
| v3 — Executive polish | Calm visual language, unified dashboard, last-conversation notes, Subscriptions category |
| Docs & handoff | BRD, PRD, branding guidelines, instructional README |

---

*This document is a living artifact; changes are logged in git alongside the code.*
