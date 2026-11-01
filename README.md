# NetworkRM

A personal CRM that builds your rolodex from email.

The problem it solves (from the brief): a busy person's network is scattered
across old emails. NetworkRM scans imported mail, builds a contact database
automatically, tags each contact (clients, internal team, investors, partners,
vendors, other), and keeps a running record of who you talk to, when you last
interacted, and the context around each person.

## What it does

- Import email: drag in Gmail Takeout `.mbox` exports, single `.eml` files, or
  paste raw messages. Parsing happens in the browser, so you only upload the
  contact data you actually want to keep.
- Auto rolodex: every sender becomes a contact with first seen, last
  interaction, message count and a context summary from recent subjects.
- Auto categorization: keyword scoring over email text, plus domain rules
  (your work domain is Internal team). Every suggestion can be overridden, and
  overrides are remembered per domain.
- Running database: dashboard with stale-contact nudges (no contact in 60
  days), category breakdown and recent activity. Notes and context fields per
  contact, editable.
- Local by default: everything lives in an SQLite file on your machine.

## Run it locally

Requires Node.js 18+ (Node 24 recommended; the app uses the built-in
`node:sqlite` module).

```bash
npm install
npm run dev   # (or: npm start)
```

Open http://localhost:3000

The database is created at `data/networkrm.db` on first run and seeded with a
sample mailbox so you can see the whole flow immediately. Wipe it in Settings,
then import your own mail.

## What to import from Gmail

1. Google Account, Data and privacy, Download your data.
2. Select Mail, choose format: mbox.
3. Unzip and drop the `.mbox` files into NetworkRM, or open the import page
   and paste a message.

## Architecture

```
server.js          Express API + static hosting
lib/db.js          SQLite schema and data access (node:sqlite)
lib/categorize.js  Rule-based category scoring + learned hints
lib/seed.js        Sample mailbox generator
public/index.html  Single-page shell
public/app.js      Views, routing, import preview flow
public/parser.js   .eml / .mbox / pasted-text parser (browser)
public/styles.css  Linear-inspired tokens, light and dark
```

The API: `/api/stats`, `/api/contacts`, `/api/contacts/:id`,
`/api/import/preview`, `/api/import`, `/api/demo`, `/api/settings`,
`/api/reset`.

## Configure Gmail from VS Code (local .env)

The app reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a `.env`
file in the project root, so you can keep credentials in VS Code instead of
the Settings page. Real environment variables always win over the file.

1. Copy `.env.example` to `.env` and paste your Client ID and Client Secret.
2. In Google Cloud Console, add `http://localhost:3000/api/gmail/callback`
   to the OAuth client's Authorized redirect URIs.
3. `npm start`, open the app, and click **Sign in with Google**.

The `.env` file is gitignored, so credentials never get committed.

## Live Gmail sync (OAuth)

The app has a built-in **Gmail** page (sidebar) that signs into Google,
syncs your mailbox automatically, and builds the rolodex with no manual
import. Every sync pulls senders from the last 6 months (or since the
previous sync), dedupes by (contact, date, subject), and re-runs category
scoring.

To enable it you need a Google Cloud OAuth client:

1. Cloud Console → APIs & Services → enable the **Gmail API**.
2. Create an OAuth client ID (type: Web application).
3. Add an authorized redirect URI:
   `https://<your-app-host>/api/gmail/callback`
   (locally: `http://localhost:3000/api/gmail/callback`).
4. Put the Client ID + Secret in the Gmail page's **Configure** box, or bake
   them into the deployment as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Click **Sign in with Google**, grant read-only access, then **Sync now**.

Tokens are stored only in the app's settings table, never in git. The app
remembers your manual category choices as domain hints, so the same company
always lands in the bucket you chose.

## Working on it in VS Code with Cline

- Open this folder in VS Code.
- Cline (installed from the extensions marketplace) with an OpenAI-compatible
  provider, Base URL `https://api.sudocode.chat/v1`, your API key, and model
  ID `gpt-5.6-sol` (use the exact model ID from the model list).
- Start with `npm install` then `npm start`, and ask Cline to work against
  `server.js`, `lib/` and `public/`.

## Data notes

- Contacts dedupe by normalized email.
- Category changes are remembered as domain hints, so future imports of the
  same domain land in your chosen category.
- Reset (Settings page) clears contacts, email history, hints and settings,
  then reseeds the sample mailbox.
