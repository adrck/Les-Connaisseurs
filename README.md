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
assets/js/riders.js    Rider list (pages/riders.html) — no longer linked from the header nav, page still works if visited directly
assets/js/teams.js     Team rosters (pages/teams.html)
assets/js/standings.js Leaderboard (pages/standings.html)
assets/js/rules.js     Fills in dynamic values on pages/rules.html
assets/js/contact.js   Feedback/questions form (pages/contact.html)
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
  (using whichever of their 23 riders were *active* during that specific
  stage — see "Bench riders and swaps" below)
- `leaderboard_history` — each player's cumulative total after that stage,
  including any swap penalties incurred by then; recomputed from scratch
  every time `main.py update` runs, so it stays correct even if a stage
  gets reprocessed out of order

The Standings page reads `leaderboard_history` and lets you pick any past
stage to see standings and the change since the previous stage. The Riders
page reads `rider_points` to show each rider's season total.

This is driven by `main.py` (+ `scoring.py`, `stage_parser.py`), a local
CLI you run yourself — it's not part of the website. Team rosters come from
a local `teams.json` (see `teams_example.json` for the shape):
```json
{
  "Alice": {
    "riders": ["rider/...", "...23 total, first 20 = active..."],
    "swaps": [{"stage": 12, "swap_out": "rider/...", "swap_in": "rider/..."}]
  }
}
```
`main.py`'s `--team-size` flag (default `20`) should match
`data/settings.json`'s `teamSize` if you ever change it.

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

**Players now pick 23 riders, not just `teamSize`.** `data/settings.json`'s
`teamSize` (20) + `benchSize` (3) = 23 total: the first `teamSize` are
active, the rest are bench/reserve (see "Bench riders and swaps" below).
Double check the Sheet has columns up to `Rider 23`, not just `Rider 20` —
if it only goes up to `Rider 20`, add `Rider 21` through `Rider 23`. The
`doGet`/`doPost` code in `docs/apps-script-doPost.gs.txt` already reads
however many `Rider N` columns exist, so it doesn't need touching beyond
pasting that file in — just add the extra header columns and it'll pick
them up automatically.

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
has the full `doPost` **and** `doGet` implementation together — replace your
entire Apps Script project's code with it (or merge it in if you've
customized yours). It expects a **PIN** column in your sheet (any position,
found by header name), alongside
`Timestamp | Player Name | First Name | PIN | Rider 1 ... Rider 23`
(23, not 20 — see "Bench riders and swaps" below). In short, it:
- Looks up a row by Player Name (case-insensitive)
- If no `action` is sent (a normal submission): creates a new row if the
  name doesn't exist yet; if the name exists *and* the PIN matches, either
  overwrites it (entries still open) or treats it as a swap request
  (entries closed — see below); rejects the write with an error message if
  the PIN doesn't match
- If `action: "lookup"` is sent: returns that player's existing riders (and
  how many swaps they've already used) if the name+PIN matches,
  `{ exists: false }` if the name isn't found yet, or an error if the name
  exists but the PIN doesn't match

Redeploy the Web App (Deploy → Manage deployments → Edit → New version)
after adding this so it actually goes live.

### Bench riders and swaps

Each player picks **23** riders, not 20 — the first `teamSize` (20, from
`data/settings.json`) are their active team, the last `benchSize` (3) are
bench/reserve riders. Your Sheet's Rider columns need to run from
`Rider 1` through `Rider 23` to match (add the 3 extra columns if you
haven't already).

Once `data/settings.json`'s `entriesOpen` becomes `false`, a submission for
an *existing* player name is no longer treated as a free edit — it's
compared against what's already stored, and only reordering which riders
are in the active first `teamSize` positions is allowed (the full 23-rider
pool must stay identical; trying to bring in a rider from outside it, or
change the total count, is rejected). Each rider who leaves the active set
counts as one swap. Swaps are capped at `maxSwaps` (3, from
`settings.json`), tracked per player in a new **"Swaps"** sheet tab
(`Timestamp | Player Name | Stage | Swap Out | Swap In`) that gets created
automatically the first time it's needed — same pattern as the "Contact"
tab.

To know *which* stage a swap counts as taking effect from, the script
fetches your live `data/state.json` (`SITE_STATE_URL` near the top of
`docs/apps-script-doPost.gs.txt` — update that constant if your site ever
moves) and uses one more than the highest number in `stages_processed`
(or stage 1 if that list is still empty). This means there's a window
between a stage actually being raced and you running `main.py update` for
it locally where a swap would be recorded against the *previous* stage
number instead of the correct one — fine for a friends' group, just worth
knowing.

**Getting swaps into `teams.json`:** `main.py` reads team rosters from a
local `teams.json` you maintain by hand (see "Scoring the race" below) —
it's separate from the live Sheet. `doGet` now includes each team's swap
history alongside their riders, so after any swaps happen, fetch
`YOUR_APPS_SCRIPT_URL?action=teams` in a browser and copy each team's
updated `riders` (bench reordering doesn't matter, only the roster
contents) and `swaps` array into your local `teams.json` before running
`main.py update` — same manual step you already do for the roster itself,
now just carrying `swaps` along with it. See `teams_example.json` for the
exact shape.

**Partially enforced:** whether entries are still open. `doPost` now fetches
the live `data/settings.json` itself (`SITE_SETTINGS_URL` near the top of
the file) to check `entriesOpen` server-side — a brand new player name is
rejected once it's `false`, and an existing player's submission switches
from a free edit to swap-only mode. If that fetch fails for any reason
(site down, network hiccup), it fails *open* (treats entries as still open)
rather than blocking everyone — a reasonable trade-off for a small trusted
group, but worth knowing if something seems off right around when entries
close.

### Contact page

`pages/contact.html` / `assets/js/contact.js` is a basic feedback/questions
form (name and email optional, message required). It posts to the same
Apps Script deployment with `action: "contact"`.

The `doPost` code in `docs/apps-script-doPost.gs.txt` handles this by
writing each message to a **"Contact"** sheet tab — it creates that tab
automatically the first time someone submits the form, so there's no extra
setup needed in the Sheet itself beyond having the updated `doPost` deployed.

### Making the Teams page work

The **Teams** page (`pages/teams.html` / `assets/js/teams.js`) shows every
player's picked riders alongside each rider's current points. It needs a way
to *read* the submissions back out of the Google Sheet, which the Apps
Script project doesn't currently expose (it only accepts `doPost`, used for
submitting).

To enable this, add a `doGet` handler to the same Apps Script project — it's
already included in `docs/apps-script-doPost.gs.txt` (that file has both
`doPost` and `doGet` together now), so if you've already pasted that file
in for the PIN/swap features above, `doGet` is already there too and no
separate step is needed. It reads the same `Rider 1`...`Rider 23` and
`First Name` columns described above, plus each team's swap history from
the "Swaps" tab (see "Bench riders and swaps" above).

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
