# NetworkRM — Branding Guidelines

| | |
|---|---|
| Brand | NetworkRM |
| Version | 1.0 |
| Applies to | App UI, favicon, docs, future marketing/presentations |

---

## 1. Brand essence

**NetworkRM is the executive's quiet backstage.** It doesn't shout; it clears
the noise. The brand promise: *your network, remembered.*

Three words to hold onto when making anything for NetworkRM:

1. **Calm** — light, airy, unhurried. No dense dashboards, no alarms.
2. **Confident** — one accent color used sparingly; clean type; precise spacing.
3. **Personal** — built for one person's relationships; every screen speaks to "your" network.

## 2. Personality & voice

- **Tone**: assured, understated, helpful. Short sentences. No jargon.
- **Voice do's**: "Who you talk to, when you last talked, and why they matter."
- **Voice don'ts**: hype ("revolutionary"), urgency ("act now"), technical
  lecture ("SQLite-backed ingestion pipeline").
- **Naming**: NetworkRM. The R stands for relationships; the M for memory.
  Never "Network CRM" in copy. Tagline options: *Your network, remembered* /
  *Built from email. Kept by you.*

## 3. Logo & mark

**Primary mark**: the "NR" monogram on a rounded square.

- Shape: 36px square, 11px radius, gradient background.
- Gradient: `#3B3590 → #4F46E5 (55%) → #6C5CE7` (135deg).
- Glyph: white "NR", Inter, weight 700, ~13px, letter-spacing 0.01em.
- Shadow: `0 3px 8px rgba(79,70,229,.35)`.

**Usage rules**
- Minimum size: 24px (mark only); never below 16px.
- Clear space: at least the mark's corner radius on all sides.
- Do not recolor the gradient; do not outline; do not add effects.
- On dark backgrounds, use the mark on its own card or the white "NR" text
  form; never invert the gradient.

**Favicon** (16–32px): same rounded-square mark with "NR", white on indigo.
Also shipped as an inline SVG (`/favicon.ico`).

## 4. Color system

### 4.1 Neutrals (the canvas)

| Token | Hex | Use |
|---|---|---|
| --bg | `#F6F6F4` | App background |
| --sidebar | `#FBFBFA` | Sidebar surface |
| --surface | `#FFFFFF` | Cards, tables |
| --border | `#E9E8E3` | Hairlines |
| --border-strong | `#DAD9D3` | Stronger dividers |
| --ink | `#18181D` | Primary text |
| --ink-2 | `#52525E` | Secondary text |
| --ink-3 | `#8E8E98` | Tertiary/hints |
| --ink-4 | `#BDBDC5` | De-emphasized |

### 4.2 Accent (the one voice)

| Token | Hex | Use |
|---|---|---|
| --accent | `#4F46E5` | Primary actions, active states |
| --accent-hover | `#4338CA` | Hover on primary |
| --accent-soft | `#EEF0FE` | Active nav background |
| --accent-ink | `#4438C9` | Accent-colored text on light |

Rules: the accent appears on **one primary action per view**, the active nav
item, and the brand mark. Everything else stays neutral.

### 4.3 Category colors (the data)

| Category | Hex | Badge bg | Avatar gradient |
|---|---|---|---|
| Clients | `#0E9F6E` | rgba(14,159,110,.11) | `#0E9F6E → #0B8A5F` |
| Internal team | `#3B82F6` | rgba(59,130,246,.11) | `#3B82F6 → #2563EB` |
| Investors | `#8B5CF6` | rgba(139,92,246,.12) | `#8B5CF6 → #7C3AED` |
| Partners | `#D97706` | rgba(217,119,6,.12) | `#F59E0B → #D97706` |
| Vendors | `#0EA5A5` | rgba(14,165,165,.12) | `#14B8A6 → #0EA5A5` |
| Subscriptions | `#DB2777` | rgba(219,39,119,.11) | `#EC4899 → #DB2777` |
| Other | `#9AA0A6` | rgba(154,160,166,.14) | `#9AA0A6 → #7C8288` |

Semantic states: ok `#0E9F6E`, warn `#D97706`, danger `#DC2626`.

## 5. Typography

| Use | Family | Weights |
|---|---|---|
| UI / headings / body | **Inter** | 400, 500, 600, 650 |
| Data / timestamps / emails | **JetBrains Mono** | 400, 500 |

- Base size 14px, line-height 1.5; -webkit-font-smoothing: antialiased.
- Headings: 650 weight, tight letter-spacing (-0.01em to -0.02em).
- Mono is reserved for email addresses, domains, counts, and timestamps —
  gives data a quiet, precise feel.
- Load via Google Fonts with preconnect; fall back to system-ui/Segoe UI.

## 6. Layout & shape

- Shell: 238px sidebar + fluid main (`36px/44px` padding on main).
- Radius: cards 14px (`--radius`), controls 10px (`--radius-sm`), pills 20px.
- Shadows: two steps only —
  - sm: `0 1px 2px rgba(24,24,29,.04), 0 1px 1px rgba(24,24,29,.03)`
  - md: `0 2px 6px rgba(24,24,29,.05), 0 10px 28px rgba(24,24,29,.07)`
- Generous whitespace is a feature, not empty space.

## 7. Iconography

- 16px grid, 1.5px stroke, `stroke="currentColor"`, fill none.
- Line icons only — no filled, no gradients, no emoji in UI chrome.
- Categories can use colored dots/badges; avatars use initials on gradients.

## 8. Components

- **Buttons**: primary (accent bg, white text, 10px radius); ghost/secondary
  (1px border, neutral); danger (red text + red-tinted border).
- **Badges**: pill, 11.5px/600, colored dot before label, category-tinted bg.
- **Avatars**: 34px (list) / 52px (detail) rounded squares, initials, category gradient.
- **Cards**: white surface, hairline border, radius 14px, optional shadow on hover.
- **Table**: minimal header, row hover, click-through to detail, truncation with tooltips.
- **Empty states**: icon + short heading + one CTA.

## 9. Data visualization

- Category breakdown: horizontal bars (8px tall, 6px radius) colored by
  category; numbers in tabular-nums.
- Timeline: dot + text rows; direction shown by dot style (in/out).
- Relative time always ("2d ago"), full date on hover/detail.

## 10. Do's and don'ts

**Do**
- Use calm neutrals as the base; let data and the one accent carry meaning.
- Truncate long notes with tooltips instead of wrapping everything.
- Use mono for anything machine-identifiable (emails, counts, timestamps).
- Keep one primary action per screen.

**Don't**
- Don't add more than one accent color.
- Don't use stock photo backdrops or heavy gradients in the UI.
- Don't crowd the dashboard with charts and gauges.
- Don't use "—" or jargon in user-facing copy.

## 11. Applied examples

- **Dashboard**: 4 stat cards (numbers only), 2 columns of activity, category
  bars, one sample-data banner when applicable, one primary CTA.
- **Contacts**: table with avatar+name, category badge, relative time, mono
  counts, last-conversation cell, pill filters, search.
- **Detail**: avatar-lg, name, email, actions row (Email/Copy/category),
  Last conversation card, meta row, profile + email history.

---

*Any new surface should be checked against sections 4, 5 and 6 first.*
