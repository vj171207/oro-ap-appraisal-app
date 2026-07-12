# Oro AP Appraisal App

Two related but independent tools for Oro's Lending Services Audit team,
sharing one Firebase project, one Vercel deployment, and a small set of
common infrastructure (auth, city list, toasts):

- **AP Appraisal Calibration** — quarterly gold-purity calibration testing
  of Appraisal Partners (APs), replacing the manual Google Sheet process.
- **AP Interview** — tracking candidate interview results during AP hiring.

They're two separate workspaces from the person's point of view (see
`home.html`), each with its own city dashboards, entry forms, reports, and
Settings page — but genuinely two apps, not one app with a mode switch.
"Shared" below means literally shared code/data, not just similar-looking.

## AP Appraisal Calibration

A web app for Oro's Lending Services Audit team to run and record quarterly
Appraisal Partner (AP) calibration tests, replacing the manual Google Sheet
process.

### What this app does

Each quarter, an auditor visits a branch in a city and tests each Appraisal
Partner (AP) there using 5 gold "needles" of known purity. The AP appraises
each needle and the auditor records what the AP says. This app:

- Lets the auditor pick a city, then start a new calibration session for an AP
- Auto-calculates the score for each needle (no manual 0/1/2 dropdown)
- Auto-calculates the total score and Pass/Fail result
- Enforces the SOP's hard auto-fail rule (see below) — it cannot be
  overridden by a high score
- Stores every session in Firestore and shows a per-city history

### Scoring rules (from the Oro AP Calibration SOP)

Per needle, comparing the **known karat** (`given`) to what the **AP reported**
(`answer`):

| Condition | Score | Auto-fail? |
|---|---|---|
| Exact match | 2 | No |
| Off by 1 karat (both normal karats) | 1 | No |
| Off by 2+ karats (both normal karats) | 0 | No |
| Known = "Below 18K", AP says a normal karat | 0 | **Yes** — AP missed a genuinely sub-18K item |
| AP says "Below 18K", known is a normal karat | 0 | No — false alarm, not a missed detection |

**Overall result:**
- Total score = sum of all 5 needle scores (max 10)
- **Pass** requires total score ≥ 7 **and** no auto-fail triggered
- **Fail** if total score ≤ 6, **or** if any needle triggered auto-fail —
  regardless of total score

All of this logic lives in `js/scoring.js` as pure functions, independent of
Firestore or the UI, so it can be tested or audited on its own.

## Project structure

No build step, no bundler — every file below is served as-is. Grouped by
which app(s) actually use it, since that's the useful question when you're
trying to find where something lives.

```
SHARED (used by both apps)
├── home.html + js/home.js        Landing page — pick a workspace
├── login.html + js/login.js      Sign-in form (domain-restricted)
├── css/styles.css                All styling, both apps
├── js/authGuard.js                Auth check + user-bar + Settings-link
│                                  routing, imported at the top of every
│                                  other page's script
├── js/firebase-config.js          Firebase app + Firestore init
├── js/toast.js                    Toast notifications + global error
│                                  reporting (catches uncaught errors so
│                                  they're visible on-screen, not just in
│                                  DevTools)
├── js/cities.js                   Reads config/cities from Firestore
│                                  (shared list — a city added here shows
│                                  up in BOTH apps)
├── js/citySettings.js             "Add a city" UI logic, used by both
│                                  settings pages
└── js/dateRangeUtils.js           Pure date-range math (Quick Range
                                   presets, From/To filtering) — the one
                                   piece of filter logic that really is
                                   identical between the two apps

AP APPRAISAL CALIBRATION
├── index.html + js/index.js       City selection (landing page)
├── city.html + js/city.js         One city's calibration history +
│                                  "New calibration" button
├── calibration.html + js/calibration.js
│                                  New calibration entry form (5 needles)
├── reports.html + js/reports.js   All-cities Excel report
├── settings-calibration.html + js/settings-calibration.js
│                                  Auditor roster management + city list
│                                  (city list section delegates to the
│                                  shared js/citySettings.js)
├── js/scoring.js                  Scoring rules — pure functions, no
│                                  dependencies (see below)
└── js/exportExcel.js               Excel export styling/generation

AP INTERVIEW
├── interview.html + js/interview.js
│                                  City selection + overall dashboard
├── interview-city.html + js/interview-city.js
│                                  One city's interview history +
│                                  "New Interview" button
├── interview-entry.html + js/interview-entry.js
│                                  New interview entry form
├── interview-reports.html + js/interview-reports.js
│                                  All-cities Excel report
├── settings-interview.html + js/settings-interview.js
│                                  City list only (nothing interview-
│                                  specific to manage yet — no interviewer
│                                  roster the way calibration has auditors)
├── js/interviewStats.js           Decision classification (Selected/
│                                  Rejected — Round 1 Decision is free
│                                  text, not a fixed field) + re-exports
│                                  the shared date-range helpers
└── js/exportInterviewExcel.js     Excel export styling/generation

RENDERING HELPER (shared)
└── js/domReconcile.js             Keeps city-history list DOM nodes
                                   across filter changes instead of
                                   wiping and rebuilding everything —
                                   used by both city.js and
                                   interview-city.js

BACKEND (Vercel serverless functions + Admin SDK)
├── api/create-user.js              Creates a Firebase Auth user (used
│                                    when adding an auditor)
├── api/remove-auditor.js           Removes an auditor's Firebase Auth
│                                    account
└── lib/firebaseAdminHelpers.js     Shared JWT-signing/token logic for
                                     the two functions above

firestore.rules                     Security rules for BOTH apps' Firestore
                                     collections — calibrations,
                                     interview_entries, appraisal_partners,
                                     config/*
vercel.json                         cleanUrls: true — this is why URLs in
                                     the browser show as e.g. /interview
                                     rather than /interview.html
```

### Data model (Firestore)

Single collection: `calibrations`. One document = one AP's one quarterly test.

```js
{
  city: "Chennai",
  testDate: "2024-03-15",         // built from Day/Month/Year dropdowns
  monthYearLabel: "Mar 2024",     // for display and quarter grouping
  auditorName: "Arun Mathiyazhagan",
  auditorEmpCode: "ORO00320",
  apName: "K Manikandan",
  apEmpCode: "ORO00020",
  apDoj: "2021-02-04",
  needles: [
    { given: "21K", answer: "20K", score: 1 },
    // ...5 total
  ],
  totalScore: 7,
  autoFailTriggered: false,
  result: "Pass",
  remarks: "",
  createdAt: <Firestore server timestamp>
}
```

No `appraisal_partners` master-data collection yet — AP name/code/DOJ are
entered manually on each session for now. This is a known gap, tracked for a
future update once we know where AP master data actually lives.

## Auth

Firebase Auth (email/password), gated to `@orocorp.in` addresses only —
enforced in three overlapping places, not just one:

1. **`login.html`/`js/login.js`** — the sign-in form itself checks the
   domain before letting a successful Firebase sign-in through
2. **`js/authGuard.js`** — every page in both apps calls `requireAuth()` at
   the top of its own script, which re-checks the domain and bounces to
   `login.html` if it's not signed in or not an allowed domain. Also
   forces a fresh sign-in on an actual browser refresh (F5) specifically —
   normal in-app navigation (clicking a link) does NOT re-trigger this,
   only a literal reload
3. **`firestore.rules`** — the real enforcement layer; even if someone
   bypassed both of the above (e.g. by calling Firestore directly), every
   read/write still requires `request.auth.token.email` to match
   `@orocorp.in`

**Managers** (a Firestore-managed allowlist, `config/managers`) get an
additional "⚙ Settings" link — see "Managing the city list" below. This is
authorization on top of the authentication above, not a replacement for it.

There's no separate "auditor" vs "manager" *role* beyond that one
Settings-access distinction — anyone with a valid @orocorp.in account can
use either app's main features (entering calibrations/interviews,
browsing history, exporting reports).

## Tech stack

- Plain HTML/CSS/JS (no build step, no framework)
- Firebase Firestore (via the modular v10 SDK, loaded from CDN — no npm
  install needed)
- Hosted on Vercel as a static site

## Local development

No build step. Just open `index.html` via a local server (not `file://`,
since ES modules require http/https). For example:

```bash
npx serve .
```

## Deploying

Push to the `main` branch on GitHub — if connected to Vercel, it will
auto-deploy. If Vercel is caching a stale `app.js`/JS bundle after a push,
the reliable fix (per the Tenmark Audit App's experience) is a manual
drag-and-drop re-upload of the changed files via the GitHub web UI, followed
by a hard-refresh/incognito check in the browser.

### AP roster lookup (Employee Code → Name/DOJ autofill)

The AP master roster lives in a separate Google Sheet ("Current list of
Appraisal Partners," tab "AP Details") maintained outside this app. Rather
than calling that sheet live from the app, it's kept in sync one-way into a
Firestore collection, `appraisal_partners` (document ID = Employee Code):

```
Google Sheet ("AP Details" tab)
      │  Apps Script (apps-script/Code.gs, lives IN the sheet, not this repo)
      │  — runs on every edit, plus a manual "fullSync" as a safety net
      ▼
Firestore: appraisal_partners/{empCode}
      │  read directly by the app (no backend, no API call at request time)
      ▼
calibration.html — auditor types an Employee Code, Name + DOJ autofill
```

`apps-script/Code.gs` in this repo is a **copy for documentation/handover
purposes only** — it does not run as part of the deployed app. The real copy
lives inside the Google Sheet itself (Extensions → Apps Script). See the
comment block at the top of that file for full one-time setup steps
(service account, Script Properties, triggers).

Name and DOJ remain editable after autofill — if the roster is stale or the
lookup misses, the auditor can still type them in manually.

### ⚠️ Handover note: transferring this before the intern's account is deactivated

The sync code lives in the Sheet's bound Apps Script project and isn't tied
to any one person. But the **installable `onSheetEdit` trigger** runs under
whichever Google account created it — so once that account is deactivated,
the trigger silently stops firing (the Sheet keeps working fine; Firestore
just stops receiving updates, with no visible error to anyone editing the
Sheet).

**Before the outgoing intern's account is deactivated:**

1. Give the incoming owner **Editor access** to the AP roster Sheet (any
   Google account works, doesn't need to be on the same Workspace domain)
2. They open the Sheet → **Extensions → Apps Script** — the code is already
   there, nothing to re-paste or reconfigure
3. They create their **own** trigger: clock icon → **Add Trigger** →
   function `onSheetEdit` → **From spreadsheet** → **On edit** → **Save**,
   approving the permissions prompt under their own login
4. Test it: edit a row in the Sheet, confirm the change lands in the
   `appraisal_partners` Firestore collection within a few seconds
5. Optionally delete the old trigger for tidiness (not urgent)

**Do NOT need to be redone:** the Script Properties (service account
email/key, Firestore project ID) — those belong to the script project
itself, not to any individual's account.

Do this a few days before the handoff, not on the last day, so there's time
to verify it actually works while the outgoing person can still help debug.

### Excel export / reports

Two ways to export calibration data as a styled `.xlsx` file, both using
**ExcelJS** (loaded via CDN) — not SheetJS, whose free build can't write
cell colors/fonts at all:

- **Per-city export** (on each city page): filter by Result (All/Pass/Fail)
  and Date range (all time / last 3-6-12 months / current or previous
  calendar quarter), click **Apply**, then **Export to Excel** — exports
  exactly what's currently shown.
- **All-Cities Report** (`reports.html`, linked from the landing page):
  same date-range filter, but produces one workbook with an **"Overall"**
  sheet (every city, sorted by city then date) plus a separate tab per
  city — matching the original spreadsheet's structure.

Column layout matches the original AP Calibration Google Sheet's headers
exactly (SL, Month & Year, Test Result, Score, Needle 1-5 Given/Answer/
Score, etc.), so it should look familiar to anyone who's received the old
manually-built reports. Styling logic lives in `js/exportExcel.js`, shared
by both `city.js` and `reports.js`.

## Managing the city list (Settings page)

The city list is shared between both apps — it's one Firestore document,
`config/cities`, read by both `js/cities.js` (calibration) and the
interview app's city pickers. There are two separate Settings pages now
(`settings-calibration.html` and `settings-interview.html` — see
"AP Interview" below for why), but "Add a city" on either one calls the
same shared code (`js/citySettings.js`) against the same document, so a
city added from either page immediately appears in both apps.

The city list used to be hardcoded in `js/cities.js`. It's now stored in
Firestore (`config/cities`, field `list`), editable from an in-app
**Settings** page — visible only to Managers (see below). `js/cities.js`
still exists, but now just fetches from Firestore, with a hardcoded
fallback list in case that document doesn't exist yet.

**One-time setup required** (do this once, in the Firebase Console, before
this feature works):

1. Go to `Firestore Database → Data`
2. Create a collection called `config`
3. Inside it, create a document with ID `cities`, with one field:
   - `list` (array of strings) — seed it with the current 8 cities:
     `Chennai, Bengaluru, Hyderabad, Pune, Vijayawada, Guntur, Warangal, Karimnagar`
4. Create a second document with ID `managers`, with one field:
   - `emails` (array of strings) — **must be lowercase** — currently:
     `vibhav.j@orocorp.in, rijin.c@orocorp.in`

Both documents are readable by any signed-in Oro user, but only writable
under specific conditions (see `firestore.rules`): `config/cities` can only
be written by someone whose email appears in `config/managers`; the
`config/managers` document itself can't be written from the app at all — to
add or remove a Manager, edit that document directly in the Firebase
Console.

**Why managers, not custom claims/roles:** Firebase custom claims need a
Cloud Function to set, which requires the paid Blaze plan. Looking up a
plain Firestore document from within the security rules (`isManager()` in
`firestore.rules`) achieves the same access control for free.

**Adding a city:** critical requirement — the spelling must **exactly**
match how that city appears in the AP roster sheet's Location column.
Everything (AP lookups, calibration filtering, reports) matches on this
string exactly; a casing or spelling mismatch will silently produce a
"phantom" city with no data, or fail AP lookups for that city.

### Managing the auditor list (Settings page)

The "Audit Official Name" field on the calibration form used to be free
text. It's now a dropdown, populated from `config/auditors` (field `list`,
an array of `{name, empCode}` objects) — also managed from the Settings
page, same Manager-only access as the city list. Selecting a name
auto-fills their Employee Code (which remains editable, in case it's
wrong or out of date, same philosophy as the AP lookup).

**One-time setup:** create a document with ID `auditors` inside the
`config` collection (same collection as `cities` and `managers` above),
with one field:
- `list` (array of maps) — each entry needs both `name` and `empCode`
  fields. Can start empty — Settings can add the first entries once this
  document exists.

Settings checks for both a duplicate name and a duplicate employee code
before adding a new auditor, to catch accidental double-entry.

## AP Interview

Tracks candidate interview results during AP hiring — auditors manually
enter results per candidate (no live data pulled from anywhere else); this
was deliberately built simple.

### What this app does

- City selection → per-city interview history + a "New Interview" button
- Entry form covering candidate details, appraisal scores, language/English
  proficiency, and Round 1 Decision (free text, not a fixed
  Selected/Rejected field — real-world remarks vary too much, e.g.
  "Rejected due to lack of appraisal knowledge")
- Both an overall (all-cities) and per-city dashboard: Total / Selected /
  Rejected / Selection Rate, with the same Quick Range + From/To date
  filtering as calibration
- Excel export, per-city and all-cities — same ExcelJS-based styling
  approach as calibration's reports, via `js/exportInterviewExcel.js`

### Data model (Firestore)

Single collection: `interview_entries`. One document = one candidate's one
interview record.

```js
{
  city: "Chennai",
  interviewDate: "2026-07-12",
  candidateName: "Manikandan R",
  locationDetail: "",              // e.g. "PCMC" when the candidate's actual
                                    // location differs from the city itself;
                                    // blank is correct when it doesn't
  company: "Muthoot Finance",
  role: "AP",
  age: 28,
  experience: "2 Years",
  bikeAvailable: "Yes",            // "Yes" | "No"
  dlAvailable: "Yes - DL",         // "Yes - DL" | "Yes - LLR" | "No"
  scoreTheory: 3,                  // out of 4
  scorePractical: 5,               // out of 6
  totalScore: 8,                   // manual entry, NOT auto-summed —
                                    // unlike calibration's needle scoring
  localLanguage: "Tamil",          // derived from city, not user-entered
  localLanguageProficiency: "Good",
  englishProficiency: "Average",
  round1Decision: "Selected",      // free text — see classifyDecision()
                                    // in js/interviewStats.js for how this
                                    // gets bucketed into Selected/Rejected/
                                    // Other for the dashboards
  interviewer: "Rijin C",
  remarks: "",
  createdAt: <Firestore server timestamp>
}
```

Every field except Remarks and Location (optional detail) is mandatory —
enforced via a red toast listing everything still missing, not native
browser validation. Same pattern in calibration's form. To remove this
requirement later, each of `js/calibration.js` and `js/interview-entry.js`
has one `const ENFORCE_ALL_FIELDS_REQUIRED = true;` near the top — flip to
`false`, nothing else needs to change.

### Why Round 1 Decision is free text, not a dropdown

The source spreadsheet this replaced had wildly inconsistent phrasing
("Selected", "Rejected due to lack of appraisal knowledge", "Not
Selected", "Ok for the next level"). Rather than force it into a fixed
enum and lose that nuance, it stays free text, and `classifyDecision()` in
`js/interviewStats.js` does best-effort bucketing for the dashboards: it
checks for "not selected"/"reject" before the generic "select" match
(so "Not Selected" correctly lands as Rejected, not Selected), and
anything that matches neither pattern falls into "Other" rather than being
guessed at.

### Historical data import

159 historical records were imported from the original Excel tracker
(8 city tabs) in one one-time run. The import script has already been
deleted from the repo (same pattern as calibration's original 789-record
import) — if a similar one-time import is ever needed again, it followed
this general shape: transform the source spreadsheet into a JSON file
matching the schema above, build a small admin-only HTML page that reads
that JSON and writes to Firestore with `addDoc`, run it once, verify the
data in the app, then delete the import page/script/JSON from the repo
immediately — it has no auth of its own beyond needing a valid session,
so leaving it deployed is a live-write risk.

## Known gaps / next steps

- [ ] Automatic "2 consecutive quarter fails → PIP" flagging across a city's
      history
- [ ] AP roster sync currently one-way (Sheet → Firestore); if a lookup
      shows stale data, the fix is in the Sheet, not the app
- [ ] Retention policy undecided — how long calibration/interview records
      should be kept, whether AP roster edit history matters, whether an
      offline export is needed before any deletion
- [ ] No automated Firestore backups — the free Spark plan doesn't support
      native backups. Agreed fallback approach (not yet built): an
      "Export all data to Excel" button reading both collections and
      downloading via the same ExcelJS approach already used for reports
- [ ] Both dashboards' overview pages (`index.html`, `interview.html`,
      `reports.html`, `interview-reports.html`) currently fetch their
      entire collection with no `limit()`/pagination — invisible at
      today's record counts (under 1,000 combined), but worth revisiting
      once either collection is in the thousands. The per-city pages
      (`city.html`, `interview-city.html`) already scope their reads to
      one city, which helps, but still has no ceiling
- [ ] Firebase Auth roles are currently just "any @orocorp.in account" vs
      "Manager" (Settings access) — no separate auditor/interviewer role
      distinction if that's ever needed
- [ ] `delete-calibration-record.mjs` at the repo root is a one-off script
      for a specific already-deleted test record — safe to delete now
      that it's served its purpose
