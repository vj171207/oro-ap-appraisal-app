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
  monthYear: "2024-03",           // from an <input type="month">
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

## Known gaps / next steps

- [ ] AP master data (name/code/DOJ autofill from employee code) — on hold,
      pending confirmation of where this data currently lives
- [ ] Firebase Auth + role-based access (auditor / manager / city head)
- [ ] Automatic "2 consecutive quarter fails → PIP" flagging across a city's
      history
- [ ] Cross-city summary/reporting view
