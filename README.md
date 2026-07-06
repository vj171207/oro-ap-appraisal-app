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

## Known gaps / next steps

- [ ] Firebase Auth + role-based access (auditor / manager / city head)
- [ ] Automatic "2 consecutive quarter fails → PIP" flagging across a city's
      history
- [ ] Cross-city summary/reporting view
- [ ] AP roster sync currently one-way (Sheet → Firestore); if a lookup
      shows stale data, the fix is in the Sheet, not the app
