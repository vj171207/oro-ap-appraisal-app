# Oro AP Appraisal Calibration

A web app for Oro's Lending Services Audit team to run and record quarterly
Appraisal Partner (AP) calibration tests, replacing the manual Google Sheet
process.

## What this app does

Each quarter, an auditor visits a branch in a city and tests each Appraisal
Partner (AP) there using 5 gold "needles" of known purity. The AP appraises
each needle and the auditor records what the AP says. This app:

- Lets the auditor pick a city, then start a new calibration session for an AP
- Auto-calculates the score for each needle (no manual 0/1/2 dropdown)
- Auto-calculates the total score and Pass/Fail result
- Enforces the SOP's hard auto-fail rule (see below) — it cannot be
  overridden by a high score
- Stores every session in Firestore and shows a per-city history

## Scoring rules (from the Oro AP Calibration SOP)

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

```
index.html            City selection (landing page)
city.html             One city's calibration history + "New calibration" button
calibration.html      New calibration entry form (5 needles)

css/styles.css         All styling

js/firebase-config.js  Firebase app + Firestore initialization
js/cities.js           List of cities (edit here to add/remove a city)
js/scoring.js          Scoring rules — pure functions, no dependencies
js/index.js            Logic for index.html
js/city.js             Logic for city.html
js/calibration.js      Logic for calibration.html
```

## Data model (Firestore)

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

Not implemented yet. The app is currently open — anyone with the URL can
enter or view data. This is intentional for the pilot phase and should be
addressed before wider rollout (Firebase Auth is the natural fit, matching
the Tenmark Audit App).

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

## AP roster lookup (Employee Code → Name/DOJ autofill)

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

## Excel export / reports

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

## Managing the auditor list (Settings page)

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

## Known gaps / next steps

- [ ] Firebase Auth + role-based access (auditor / manager / city head)
- [ ] Automatic "2 consecutive quarter fails → PIP" flagging across a city's
      history
- [ ] AP roster sync currently one-way (Sheet → Firestore); if a lookup
      shows stale data, the fix is in the Sheet, not the app
