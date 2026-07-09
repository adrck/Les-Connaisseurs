# Les Connaisseurs — Fantasy Cycling

A small static website for running a fantasy cycling competition among friends.
Players pick a team of riders before the race, and after each stage the
organiser updates a JSON file with the latest scores. No backend server is
required — the site is plain HTML/CSS/JS and can be hosted anywhere static
files are served (e.g. GitHub Pages).

## Structure

```
index.html            Shell page — loads pages/*.html into #content via main.js
assets/css/style.css   All styling
assets/js/main.js      Client-side "router" that loads page fragments + their script
assets/js/form.js      Entry form (pages/enter.html)
assets/js/riders.js    Rider list (pages/riders.html)
assets/js/teams.js     Team rosters (pages/teams.html)
assets/js/standings.js Leaderboard (pages/standings.html)
assets/js/rules.js     Fills in dynamic values on pages/rules.html
pages/*.html           Page fragments (not full HTML documents)
data/settings.json     Competition-wide settings (name, team size, entries open/closed)
data/riders.json       The full startlist (name, team, bib)
data/state.json        Scores: per-rider points, per-stage history, per-player leaderboard
```

## How scoring works today

After each stage, the organiser updates `data/state.json` with:

- `rider_points` — each rider's season-to-date points
- `stages_processed` — which stage numbers have been scored
- `stage_history` — points scored by each rider, per stage
- `team_stage_history` — each player's total points scored in that stage
- `leaderboard_history` — each player's cumulative total after that stage

The Standings page reads `leaderboard_history` and lets you pick any past
stage to see standings and the change since the previous stage. The Riders
page reads `rider_points` to show each rider's season total.

## Team entry & the Google Sheet

The **Enter Team** form (`pages/enter.html` / `assets/js/form.js`) submits
each entry as JSON to a Google Apps Script Web App, which is expected to
write it into a Google Sheet. `data/settings.json`'s `teamSize` controls how
many rider dropdowns are shown, and `entriesOpen: false` closes the form.

### Making the Teams page work

The **Teams** page (`pages/teams.html` / `assets/js/teams.js`) shows every
player's picked riders alongside each rider's current points. It needs a way
to *read* the submissions back out of the Google Sheet, which the Apps
Script project doesn't currently expose (it only accepts `doPost`, used for
submitting).

To enable this, add a `doGet` handler to the same Apps Script project,
something like:

```javascript
function doGet(e) {

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift(); // first row = column headers

  const playerNameCol = headers.indexOf("playerName");
  const ridersCol = headers.indexOf("riders");

  const teams = rows.map(row => ({
    playerName: row[playerNameCol],
    // Adjust this if "riders" isn't stored as a single JSON-stringified
    // column — e.g. if each rider has its own column instead, build the
    // array from those columns here.
    riders: JSON.parse(row[ridersCol])
  }));

  return ContentService
    .createTextOutput(JSON.stringify(teams))
    .setMimeType(ContentService.MimeType.JSON);

}
```

Adjust the column names/indices to match how your sheet actually stores
submissions, then redeploy the Web App (Deploy → Manage deployments → Edit →
New version) so the new `doGet` goes live. `teams.js` calls the same
deployment URL as `form.js`, with `?action=teams` appended — the parameter
is currently unused server-side but is there so you can branch on it inside
`doGet` later if the script ever needs to serve more than one kind of data.

Until `doGet` is added, the Teams page will show a friendly "not available
yet" message instead of failing silently.

## Local development

Because pages are loaded via `fetch()`, opening `index.html` directly from
disk (`file://`) won't work in most browsers. Serve the folder locally, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.
