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
many riders a player must pick, and `entriesOpen: false` closes the form.

Riders are picked through a searchable two-panel widget rather than a long
list of dropdowns: type in the left panel to filter by name/team, click a
rider to add them, and remove them again from the "Your Team" panel on the
right. The submitted payload is unchanged in shape — `riders` is still a
plain array of rider names — only now its length matches whatever
`teamSize` is set to.

**Since `teamSize` is now 20**, double check the Apps Script `doPost` (and
the Sheet itself) can handle 20 riders per submission, not 8. If your sheet
only has columns up to `Rider 8`, you'll need to add `Rider 9` through
`Rider 20`, and update `doPost` to write all 20 values instead of dropping
the extras. The `doGet` snippet below (for the Teams page) already reads
however many `Rider N` columns exist, so that side doesn't need touching —
just add the extra header columns and it'll pick them up automatically.

### Editing an existing team (name + PIN)

Players can now update their team after submitting it once, using their
player name plus a 4-digit PIN they choose on first submission (there's no
real login system — this is a lightweight "honor system" check suited to a
small group of friends, not real security. Anyone who knows someone's PIN
can edit that person's team).

How it works on the frontend (`assets/js/form.js`):
- The form now has a required **Team PIN** field next to Player Name.
- As soon as both a name and a valid 4-digit PIN are filled in, it
  automatically asks the Apps Script backend whether a team already exists
  under that name+PIN (via a `POST` with `action: "lookup"`, kept as POST
  rather than a GET query string so the PIN doesn't end up in server logs
  or browser history).
  - **Match found** → the picker pre-fills with that player's existing
    riders, and the button switches to "Update Team".
  - **Name exists but the PIN is wrong** → a clear error is shown and the
    form won't submit, so people can't overwrite someone else's team by
    guessing.
  - **No match** → treated as a new player; the button stays "Submit Team".
- On submit, the same `pin` field is sent along with the rest of the entry
  so the backend can verify it again server-side.

This needs a matching update on the Apps Script side. `docs/apps-script-doPost.gs.txt`
has the full `doPost` implementation — replace your current `doPost`
function with it (or merge it in if you've customized yours). It expects a
**PIN** column in your sheet (any position, found by header name), alongside
`Timestamp | Player Name | Email | Rider 1 ... Rider 20`. In short, it:
- Looks up a row by Player Name (case-insensitive)
- If no `action` is sent (a normal submission): creates a new row if the
  name doesn't exist yet, or **overwrites** the existing row if the name
  exists *and* the PIN matches — rejects the write with an error message if
  the PIN doesn't match
- If `action: "lookup"` is sent: returns that player's existing riders and
  email if the name+PIN matches, `{ exists: false }` if the name isn't
  found yet, or an error if the name exists but the PIN doesn't match

As with the `doGet` change, redeploy the Web App (Deploy → Manage
deployments → Edit → New version) after adding this so it actually goes
live. The existing `doGet` used by the Teams page is unaffected and doesn't
need any changes — it only ever reads Player Name and Rider columns, never
the PIN, so there's no risk of PINs leaking onto the public Teams page.

**Not enforced:** whether entries are still open. The PIN check happens
server-side, but `entriesOpen` in `settings.json` is only checked in the
browser (it just disables the form). Someone could technically still submit
after "closing" entries by calling the Apps Script URL directly. For a
small trusted group this is a reasonable trade-off — see the "budget and
trust model" discussion earlier in the project history if you want to
revisit this later.

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

  // If your tab isn't named "Sheet1", either rename it or swap this line
  // for: SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift(); // first row = column headers

  const playerNameCol = headers.indexOf("Player Name");

  // Collect every column that starts with "Rider " (Rider 1, Rider 2, ... Rider 8)
  const riderCols = headers
    .map((header, index) => ({ header, index }))
    .filter(col => col.header.toString().startsWith("Rider "))
    .map(col => col.index);

  const teams = rows
    .filter(row => row[playerNameCol]) // skip any blank rows
    .map(row => ({
      playerName: row[playerNameCol],
      riders: riderCols
        .map(colIndex => row[colIndex])
        .filter(riderName => riderName) // drop empty rider slots
    }));

  return ContentService
    .createTextOutput(JSON.stringify(teams))
    .setMimeType(ContentService.MimeType.JSON);

}
```

This matches a sheet with columns `Timestamp | Player Name | Email | Rider 1
| Rider 2 | ... | Rider 8`. If your columns differ, adjust the header names
above accordingly, then redeploy the Web App (Deploy → Manage deployments →
Edit → New version) so the new `doGet` goes live. `teams.js` calls the same
deployment URL as `form.js`, with `?action=teams` appended — the parameter
is currently unused server-side but is there so you can branch on it inside
`doGet` later if the script ever needs to serve more than one kind of data.

If the Teams page still shows nothing after this, open the browser
DevTools Console on that page — a CORS error there usually means the
deployment's "Who has access" setting needs to be "Anyone" (not "Anyone
with Google account").

Until `doGet` is added, the Teams page will show a friendly "not available
yet" message instead of failing silently.

## Local development

Because pages are loaded via `fetch()`, opening `index.html` directly from
disk (`file://`) won't work in most browsers. Serve the folder locally, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.
