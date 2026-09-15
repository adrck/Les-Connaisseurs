(function () {
"use strict";

let leaderboardHistory = {};
let stageHistory = {};
let stageResults = {};
let stageOrder = [];
let teamFinalPoints = {};
let finalStandings = null;

// Points tables — mirror pages/rules.html. If the scoring rules ever
// change there, update the matching values here too.
const FINISH_POINTS = [20, 16, 12, 10, 8, 5, 4, 3, 2, 1];
const SPRINT_POINTS = [5, 3, 1];
const CLIMB_POINTS = {
    "HC": [7, 5, 3, 2, 1],
    "1": [6, 4, 1],
    "2": [5, 3, 1],
    "3": [2, 1],
    "4": [1]
};
const JERSEY_POINTS = { leader: 5, mountain: 3, sprint: 2, young: 2 };
const FINAL_CLASSIFICATION_POINTS = {
    gc: { 1: 50, 2: 40, 3: 30, 4: 25, 5: 20, 6: 15, 7: 10, 8: 8, 9: 6, 10: 4 },
    kom: { 1: 15, 2: 10, 3: 5 },
    sprint: { 1: 10, 2: 5, 3: 3 },
    youth: { 1: 10, 2: 5, 3: 3 }
};
const FINAL_CLASSIFICATION_LABELS = { gc: "Leider", kom: "Berg", sprint: "Sprint", youth: "Jongeren" };
const TAKEOVER_POINTS = 3;
const AGGRESSIVE_POINTS = 5;

// Grand tour codes match the gt-tdf/gt-lav/gt-gdi body-class convention
// already used for jersey colors, and the same names/ordering
// pages/account.html's "Jouw geschiedenis" section uses - kept in sync
// by hand between the two files (neither can import from the other in
// this plain-script setup).
const GRAND_TOUR_NAMES = { tdf: "Tour de France", lav: "Vuelta a España", gdi: "Giro d'Italia" };
const GRAND_TOUR_CALENDAR_ORDER = { gdi: 1, tdf: 2, lav: 3 };

// Cache of already-fetched archived-season rows, keyed by
// "grandTour:seasonYear" - avoids a fresh Supabase round-trip every time
// someone flips back and forth between seasons in the dropdown within
// the same page visit. Never invalidated within a page load, since an
// already-archived season's final_points/final_rank aren't expected to
// change while someone is browsing.
const archivedSeasonCache = {};

// Jerseys as they appear in a stage's raw result JSON, mapped to the
// jersey-chip--* CSS suffix and Dutch label used on the Rules page.
const JERSEY_FIELDS = [
    { field: "gc_leader", cssClass: "leader", label: "Leider", points: JERSEY_POINTS.leader },
    { field: "kom_leader", cssClass: "mountain", label: "Berg", points: JERSEY_POINTS.mountain },
    { field: "sprint_leader", cssClass: "sprint", label: "Sprint", points: JERSEY_POINTS.sprint },
    { field: "youth_leader", cssClass: "young", label: "Jongeren", points: JERSEY_POINTS.young }
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Turns a "rider/valentin-paret-peintre" style URL into a readable
// "Valentin Paret Peintre" display name. This is a best-effort guess
// based on the slug alone (accents are lost, e.g. Pogacar vs Pogačar) —
// it doesn't try to cross-reference data/riders.json, since rider slugs
// and riders.json names don't always match exactly (extra surnames,
// spelling variants, etc).
function slugToName(riderUrl) {
    if (!riderUrl) return "Onbekende renner";
    const slug = riderUrl.replace(/^rider\//, "");
    return slug
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

async function loadResults() {

    try {

        const response = await fetch("data/state.json");

        if (!response.ok) {
            throw new Error("Resultaten konden niet geladen worden.");
        }

        const results = await response.json();

        leaderboardHistory = results.leaderboard_history || {};
        teamFinalPoints = results.team_final_points || {};
        finalStandings = results.final_standings || null;
        stageHistory = results.stage_history || {};
        stageResults = results.stage_results || {};
        stageOrder = Object.keys(leaderboardHistory)
            .map(Number)
            .sort((a, b) => a - b);

        setupStageSelect();
        setupLeaderboardCaption();
        await setupJerseyTheme();
        await loadSeasonOptions();

        const latestStage = stageOrder[stageOrder.length - 1];
        displayLeaderboard(latestStage);
        renderStageBreakdown(latestStage);

    } catch (error) {
        const tbody = document.getElementById("leaderboard-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4">Resultaten konden niet geladen worden.</td></tr>`;
        }
        console.error(error);
    }

}

// Same idea as rules.js: color the jersey chips in the stage breakdown
// according to whichever Grand Tour is currently active.
async function setupJerseyTheme() {

    try {

        const response = await fetch("data/settings.json");
        if (!response.ok) return;

        const settings = await response.json();

        document.body.classList.remove("gt-gdi", "gt-tdf", "gt-lav");

        const gtClass = {
            gdi: "gt-gdi",
            tdf: "gt-tdf",
            lav: "gt-lav"
        }[settings.whichGt];

        if (gtClass) {
            document.body.classList.add(gtClass);
        }

    } catch (error) {
        console.error(error);
    }

}

// Populates the season dropdown with "Huidig" plus one option per
// distinct (grand_tour, season_year) already archived in
// public.season_archive - publicly readable, same as the live team
// data, so this works whether or not the visitor is logged in. Self-
// contained try/catch (same pattern as setupJerseyTheme above) so a
// Supabase hiccup here can never take down the live leaderboard, which
// has already loaded successfully from state.json by the time this runs.
async function loadSeasonOptions() {

    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect || !window.supabaseClient) return;

    try {

        const { data, error } = await window.supabaseClient
            .from("season_archive")
            .select("grand_tour, season_year");

        if (error || !data || data.length === 0) return;

        const seen = new Set();
        const seasons = [];
        data.forEach(row => {
            const key = `${row.grand_tour}:${row.season_year}`;
            if (seen.has(key)) return;
            seen.add(key);
            seasons.push({ grand_tour: row.grand_tour, season_year: row.season_year });
        });

        // Most recent first, same convention as pages/account.html's
        // "Jouw geschiedenis" - season_year descending, and within a
        // shared year, the most recently FINISHED tour first (reverse
        // calendar order: Vuelta, then Tour, then Giro).
        seasons.sort((a, b) => {
            if (b.season_year !== a.season_year) return b.season_year - a.season_year;
            return (GRAND_TOUR_CALENDAR_ORDER[b.grand_tour] || 0) - (GRAND_TOUR_CALENDAR_ORDER[a.grand_tour] || 0);
        });

        const optionsHtml = seasons.map(s => {
            const label = `${GRAND_TOUR_NAMES[s.grand_tour] || s.grand_tour} ${s.season_year}`;
            return `<option value="${s.grand_tour}:${s.season_year}">${escapeHtml(label)}</option>`;
        }).join("");

        seasonSelect.insertAdjacentHTML("beforeend", optionsHtml);
        seasonSelect.addEventListener("change", handleSeasonChange);

    } catch (error) {
        console.error(error);
    }

}

function showCurrentSeasonView() {

    const currentView = document.getElementById("current-season-view");
    const archivedView = document.getElementById("archived-season-view");
    const breakdownCard = document.getElementById("stage-breakdown-card");

    if (currentView) currentView.style.display = "";
    if (archivedView) archivedView.style.display = "none";
    if (breakdownCard) breakdownCard.style.display = "";

    // Re-render from the already-loaded state.json data in memory - no
    // re-fetch needed, this is exactly what loadResults() itself does on
    // first load.
    const stageSelect = document.getElementById("stage-select");
    const stage = stageSelect ? Number(stageSelect.value) : stageOrder[stageOrder.length - 1];
    displayLeaderboard(stage);
    renderStageBreakdown(stage);

}

function showArchivedSeasonView() {

    const currentView = document.getElementById("current-season-view");
    const archivedView = document.getElementById("archived-season-view");
    const breakdownCard = document.getElementById("stage-breakdown-card");

    // No stage-by-stage detail exists for an archived season -
    // season_archive only ever stored the final snapshot - so the whole
    // breakdown card is hidden, not just emptied, rather than showing a
    // "no data" message that would look like a bug for every past season.
    if (currentView) currentView.style.display = "none";
    if (archivedView) archivedView.style.display = "";
    if (breakdownCard) breakdownCard.style.display = "none";

}

async function handleSeasonChange() {

    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect) return;

    const value = seasonSelect.value;

    if (value === "current") {
        showCurrentSeasonView();
        return;
    }

    const [grandTour, seasonYearStr] = value.split(":");
    const seasonYear = Number(seasonYearStr);

    showArchivedSeasonView();
    await renderArchivedSeason(grandTour, seasonYear);

}

// Renders the final standings for one past (grand_tour, season_year) -
// rank, team, points only, no stage detail (none was ever archived).
// Shows team.player_name (the full team name, e.g. "Team Quersos"), NOT
// the first_name/override key the live leaderboard displays elsewhere on
// this page - that key convention (see teams.js's teamTotalsKey()) exists
// for matching against state.json, not for display, and replicating it
// here would mean a fourth hand-synced copy of TEAM_KEY_OVERRIDES for a
// purely cosmetic choice. player_name is what the Teams page already
// shows, and is more identifiable a year later than a bare first name.
async function renderArchivedSeason(grandTour, seasonYear) {

    const tbody = document.getElementById("archived-leaderboard-body");
    if (!tbody || !window.supabaseClient) return;

    const cacheKey = `${grandTour}:${seasonYear}`;

    let rows = archivedSeasonCache[cacheKey];

    if (!rows) {
        try {
            const { data, error } = await window.supabaseClient
                .from("season_archive")
                .select("player_name, final_points, final_rank")
                .eq("grand_tour", grandTour)
                .eq("season_year", seasonYear);

            if (error) {
                console.error(error);
                tbody.innerHTML = `<tr><td colspan="3">Resultaten konden niet geladen worden.</td></tr>`;
                return;
            }

            rows = data || [];
            archivedSeasonCache[cacheKey] = rows;

        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="3">Resultaten konden niet geladen worden.</td></tr>`;
            return;
        }
    }

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Geen resultaten gevonden voor dit seizoen.</td></tr>`;
        return;
    }

    // Ranked teams first (by their stored final_rank, ascending), any
    // unranked ones (final_rank left null - see archive_season.py's own
    // "never fabricate a rank" rule) after, in no particular order.
    const sorted = rows.slice().sort((a, b) => {
        if (a.final_rank === null && b.final_rank === null) return 0;
        if (a.final_rank === null) return 1;
        if (b.final_rank === null) return -1;
        return a.final_rank - b.final_rank;
    });

    tbody.innerHTML = sorted.map(row => `
        <tr>
            <td>${row.final_rank !== null ? row.final_rank : "—"}</td>
            <td>${escapeHtml(row.player_name)}</td>
            <td>${row.final_points !== null ? row.final_points : "—"}</td>
        </tr>
    `).join("");

}

function setupStageSelect() {

    const select = document.getElementById("stage-select");

    if (!select) return;

    select.innerHTML = stageOrder
        .map(stage => `<option value="${stage}">Na etappe ${stage}</option>`)
        .join("");

    select.value = stageOrder[stageOrder.length - 1];

    select.addEventListener("change", () => {
        const stage = Number(select.value);
        displayLeaderboard(stage);
        renderStageBreakdown(stage);
    });

}

function setupLeaderboardCaption() {

    const tbody = document.getElementById("leaderboard-body");
    if (!tbody) return;

    const table = tbody.closest("table");
    if (!table || document.getElementById("leaderboard-medal-caption")) return;

    const caption = document.createElement("p");
    caption.id = "leaderboard-medal-caption";
    caption.className = "scoring-note";
    caption.textContent = "\ud83e\udd47 = hoogste score van de geselecteerde etappe";

    table.insertAdjacentElement("beforebegin", caption);

}

// Clicking a participant's name jumps to their card on the Teams page.
// loadPage() just injects HTML and a script tag - it has no general way to
// hand data to the page script it's about to load - so the target team key
// is stashed on window right before navigating, and teams.js picks it up
// once its own cards have actually rendered (see scrollToPendingTeam()
// there) and clears it immediately after use.
function handleParticipantLinkClick(event) {

    const link = event.target.closest(".participant-link");
    if (!link) return;

    event.preventDefault();

    window.pendingTeamScrollKey = link.dataset.teamKey;

    if (typeof loadPage === "function") {
        loadPage("teams");
    }

}

function displayLeaderboard(stage) {

    // The final classification bonus (team_final_points, from `main.py
    // finalize`) isn't part of leaderboardHistory - it's a one-off award
    // applied once at the very end of the race - so it's only merged in
    // when displaying the latest stage, not when browsing earlier ones.
    const leaderboard = { ...(leaderboardHistory[stage] || {}) };
    if (stage === stageOrder[stageOrder.length - 1]) {
        Object.entries(teamFinalPoints).forEach(([player, bonus]) => {
            leaderboard[player] = (leaderboard[player] || 0) + bonus;
        });
    }

    const stageIndex = stageOrder.indexOf(stage);
    const previousStage = stageIndex > 0 ? stageOrder[stageIndex - 1] : null;
    const previousLeaderboard = previousStage !== null
        ? (leaderboardHistory[previousStage] || {})
        : {};

    // Sort highest score first
    const standings = Object.entries(leaderboard)
        .sort((a, b) => b[1] - a[1]);

    // dayScore picks the gold-row winner(s) for this stage - it is NOT
    // shown directly anywhere. On stage 1 there's no previous stage to
    // diff against, so that stage's raw total IS the day's score (nothing
    // existed before it). On every other stage it's the real gain. The
    // visible delta column below keeps its own separate "—" placeholder
    // on stage 1, unchanged - dayScore and deltaLabel are computed
    // independently on purpose.
    const dayScores = standings.map(([player, points]) => {
        const previousPoints = previousLeaderboard[player];
        return previousPoints !== undefined ? points - previousPoints : points;
    });

    const maxDayScore = dayScores.length ? Math.max(...dayScores) : null;

    // Previous stage's ranking, so each row can show how many places it
    // moved since then. Same "no previous data" convention as deltaLabel
    // below: a team missing from the previous stage (stage 1, or a team
    // that first appears later) has no entry in this map, and
    // buildRankTrendPill() renders that as the neutral "–" pill rather
    // than a fabricated +0.
    const previousRank = {};
    Object.entries(previousLeaderboard)
        .sort((a, b) => b[1] - a[1])
        .forEach(([player], idx) => {
            previousRank[player] = idx + 1;
        });

    const tbody = document.getElementById("leaderboard-body");

    // Bind once - dataset flag survives the tbody.innerHTML rewrites below
    // since it lives on the tbody element itself, not on the rows we're
    // about to throw away and rebuild every time the stage select changes.
    if (!tbody.dataset.participantLinkBound) {
        tbody.addEventListener("click", handleParticipantLinkClick);
        tbody.dataset.participantLinkBound = "true";
    }

    tbody.innerHTML = "";

    standings.forEach(([player, points], index) => {

        const currentRank = index + 1;

        const previousPoints = previousLeaderboard[player];
        let deltaLabel = "\u2014";

        if (previousPoints !== undefined) {
            const delta = points - previousPoints;
            deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
        }

        // Ties for the top day-score all get gold - no cap, no silver/
        // bronze tier. A stage where everyone scored the same is a real
        // (if rare) "everyone gets gold" day, not a bug.
        const isTopScorer = maxDayScore !== null && dayScores[index] === maxDayScore;

        const row = document.createElement("tr");
        if (isTopScorer) {
            row.className = "leaderboard-row--top";
        }

        row.innerHTML = `
            <td>
                <div class="plaats-cell">
                    <span class="plaats-num">${currentRank}</span>
                    ${buildRankTrendPill(currentRank, previousRank[player])}
                </div>
            </td>
            <td>${isTopScorer ? "\ud83e\udd47 " : ""}<a href="#" class="participant-link" data-team-key="${escapeHtml(player)}">${escapeHtml(player)}</a></td>
            <td>${points}</td>
            <td>${deltaLabel}</td>
        `;

        tbody.appendChild(row);

    });

}

// Builds the little "\u25b2 2 / \u25bc 1 / \u2013" pill shown next to a team's rank
// number - see the "Optie A2" mockup this was picked from. previousRank
// being undefined (stage 1, or a team not yet present in the previous
// stage) is treated the same as "unchanged": the neutral pill, not a
// fabricated +0 or an up/down arrow that isn't backed by real data.
function buildRankTrendPill(currentRank, previousRankValue) {

    if (previousRankValue === undefined) {
        return `<span class="trend-pill trend-pill--same">\u2013</span>`;
    }

    const change = previousRankValue - currentRank; // positive = moved up

    if (change > 0) {
        return `<span class="trend-pill trend-pill--up">\u25b2 ${change}</span>`;
    }

    if (change < 0) {
        return `<span class="trend-pill trend-pill--down">\u25bc ${Math.abs(change)}</span>`;
    }

    return `<span class="trend-pill trend-pill--same">\u2013</span>`;

}

// Expands/collapses one rider's per-stage scoring breakdown. Bound once
// per container (see renderStageBreakdown) via delegation, since the
// container's innerHTML gets fully replaced every time the stage select
// changes - binding directly to the toggle buttons would lose the
// listeners on the very next render.
function handleRiderBreakdownToggle(event) {

    const toggle = event.target.closest(".rider-breakdown-toggle");
    if (!toggle) return;

    const summaryRow = toggle.closest("tr");
    const detailRow = summaryRow && summaryRow.nextElementSibling;
    if (!detailRow || !detailRow.classList.contains("rider-breakdown-row")) return;

    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    detailRow.hidden = isExpanded;
    summaryRow.classList.toggle("rider-summary-row--expanded", !isExpanded);

}

function renderStageBreakdown(stage) {

    const container = document.getElementById("stage-breakdown-content");
    if (!container) return;

    // Bind the toggle handler once - dataset survives the innerHTML
    // rewrites below since it lives on the container element itself, not
    // on any of the rows we're about to throw away and rebuild.
    if (!container.dataset.breakdownToggleBound) {
        container.addEventListener("click", handleRiderBreakdownToggle);
        container.dataset.breakdownToggleBound = "true";
    }

    const data = stageResults[stage];

    if (!data) {
        container.innerHTML = `<p class="scoring-note">Geen detailoverzicht beschikbaar voor etappe ${stage}.</p>`;
        return;
    }

    const parts = [];

    // The final classification bonus (final_standings, from `main.py
    // finalize`) isn't tied to any one stage's stage_history - it's a
    // one-off award for the race's final GC/KOM/Sprint/Youth top finishers
    // - so it's only merged into the rider breakdown when viewing the
    // very last stage, never when browsing earlier ones.
    const isFinalStageView = stage === stageOrder[stageOrder.length - 1];
    const finalStandingsForView = isFinalStageView ? finalStandings : null;

    const stagePoints = { ...(stageHistory[stage] || {}) };
    if (finalStandingsForView) {
        Object.entries(finalStandingsForView).forEach(([classification, riders]) => {
            const table = FINAL_CLASSIFICATION_POINTS[classification] || {};
            (riders || []).forEach((riderUrl, idx) => {
                const points = table[idx + 1];
                if (riderUrl && points !== undefined) {
                    stagePoints[riderUrl] = (stagePoints[riderUrl] || 0) + points;
                }
            });
        });
    }
    if (Object.keys(stagePoints).length) {
        parts.push(buildTotalScorePerRiderSection(stagePoints, data, finalStandingsForView));
    }

    parts.push(buildRankTableSection(
        "Etappe finish",
        null,
        data.stage_finish,
        rank => FINISH_POINTS[rank - 1]
    ));

    if (data.intermediate_sprint && data.intermediate_sprint.length) {
        const loc = data.intermediate_sprint_location;
        const note = loc
            ? `${escapeHtml(loc.name)} (km ${loc.distance_km})`
            : null;
        parts.push(buildRankTableSection(
            "Tussensprint",
            note,
            data.intermediate_sprint,
            rank => SPRINT_POINTS[rank - 1]
        ));
    }

    if (data.climbs && data.climbs.length) {
        data.climbs.forEach(climb => {
            const catLabel = climb.category === "HC" ? "HC" : `Cat. ${climb.category}`;
            const note = `${escapeHtml(climb.name)} — ${catLabel} (km ${climb.distance_km})`;
            const points = CLIMB_POINTS[climb.category] || [];
            parts.push(buildRankTableSection(
                "Beklimming",
                note,
                climb.results,
                rank => points[rank - 1]
            ));
        });
    }

    parts.push(buildJerseySection(data));

    if (data.jersey_takeovers && data.jersey_takeovers.length) {
        parts.push(buildTakeoverSection(data.jersey_takeovers));
    }

    if (data.most_aggressive_rider) {
        parts.push(buildAggressiveRiderSection(data.most_aggressive_rider));
    }

    container.innerHTML = parts.join("\n");

}

// Reconstructs, for one rider, every discrete scoring event within a
// single stage (finish placing, tussensprint, climbs, jerseys held,
// takeover, aggressive rider) by walking the exact same stage-result data
// used to build the category tables elsewhere in this file. This never
// needs its own copy of the points tables or scoring logic to keep in
// sync - it's just indexing the same data by rider instead of by rank.
function buildRiderStageEvents(riderUrl, data, finalStandings) {

    const events = [];

    (data.stage_finish || []).forEach(entry => {
        if (entry.rider_url !== riderUrl) return;
        const points = FINISH_POINTS[entry.rank - 1];
        if (points === undefined) return;
        events.push({ label: "Etappe finish", detail: `${entry.rank}e plaats`, points });
    });

    (data.intermediate_sprint || []).forEach(entry => {
        if (entry.rider_url !== riderUrl) return;
        const points = SPRINT_POINTS[entry.rank - 1];
        if (points === undefined) return;
        const loc = data.intermediate_sprint_location;
        const detail = loc
            ? `${entry.rank}e plaats — ${loc.name} (km ${loc.distance_km})`
            : `${entry.rank}e plaats`;
        events.push({ label: "Tussensprint", detail, points });
    });

    (data.climbs || []).forEach(climb => {
        const pointsForCategory = CLIMB_POINTS[climb.category] || [];
        (climb.results || []).forEach(entry => {
            if (entry.rider_url !== riderUrl) return;
            const points = pointsForCategory[entry.rank - 1];
            if (points === undefined) return;
            const catLabel = climb.category === "HC" ? "HC" : `Cat. ${climb.category}`;
            events.push({
                label: "Beklimming",
                detail: `${entry.rank}e plaats — ${climb.name} (${catLabel})`,
                points
            });
        });
    });

    JERSEY_FIELDS.forEach(jersey => {
        if (data[jersey.field] === riderUrl) {
            events.push({ label: "Klassementstrui gedragen", detail: jersey.label, points: jersey.points });
        }
    });

    if ((data.jersey_takeovers || []).includes(riderUrl)) {
        events.push({ label: "Overname van een klassementstrui", detail: null, points: TAKEOVER_POINTS });
    }

    if (data.most_aggressive_rider === riderUrl) {
        events.push({ label: "Meest aanvallende renner", detail: null, points: AGGRESSIVE_POINTS });
    }

    if (finalStandings) {
        Object.entries(finalStandings).forEach(([classification, riders]) => {
            const rank = (riders || []).indexOf(riderUrl) + 1;
            if (rank === 0) return;
            const points = (FINAL_CLASSIFICATION_POINTS[classification] || {})[rank];
            if (points === undefined) return;
            const label = FINAL_CLASSIFICATION_LABELS[classification] || classification;
            events.push({
                label: "Eindklassement bonus",
                detail: `${label} — ${rank}e plaats`,
                points
            });
        });
    }

    return events;

}

function buildTotalScorePerRiderSection(stagePoints, data, finalStandings) {

    const rows = Object.entries(stagePoints)
        .sort((a, b) => b[1] - a[1])
        .map(([riderUrl, points], index) => {

            const events = buildRiderStageEvents(riderUrl, data, finalStandings);
            // Striped by logical rider row, not raw DOM position - each
            // rider now spans two <tr>s (summary + hidden detail), so the
            // usual tr:nth-child(even) rule would stripe those in pairs
            // instead of alternating rider-to-rider.
            const stripeClass = index % 2 === 1 ? " rider-summary-row--even" : "";

            const detailItems = events.length
                ? events.map(event => `
                    <li>
                        <span class="rider-breakdown-label">${escapeHtml(event.label)}${
                            event.detail ? ` <span class="rider-breakdown-detail">— ${escapeHtml(event.detail)}</span>` : ""
                        }</span>
                        <span class="rider-breakdown-points">+${event.points}</span>
                    </li>
                `).join("")
                : `<li class="rider-breakdown-empty">Geen losse scoringsmomenten gevonden voor deze etappe.</li>`;

            return `
                <tr class="rider-summary-row${stripeClass}">
                    <td class="rider-name">
                        <button type="button" class="rider-breakdown-toggle" aria-expanded="false">
                            <span class="rider-breakdown-arrow" aria-hidden="true">&#9656;</span>
                            ${escapeHtml(slugToName(riderUrl))}
                        </button>
                    </td>
                    <td>${points}</td>
                </tr>
                <tr class="rider-breakdown-row" hidden>
                    <td colspan="2">
                        <ul class="rider-breakdown-list">${detailItems}</ul>
                    </td>
                </tr>
            `;

        }).join("");

    return `
        <h3 class="scoring-subhead">Totale score per renner</h3>
        <p class="scoring-note">Klik op een renner voor de puntenverdeling van deze etappe.</p>
        <table class="scoring-table">
            <thead>
                <tr><th>Renner</th><th>Punten</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

}

function buildRankTableSection(title, note, entries, pointsForRank) {

    const rows = (entries || []).map(entry => {
        const points = pointsForRank(entry.rank);
        return `
            <tr>
                <td>${entry.rank}</td>
                <td class="rider-name">${escapeHtml(slugToName(entry.rider_url))}</td>
                <td>${points !== undefined ? points : "—"}</td>
            </tr>
        `;
    }).join("");

    return `
        <h3 class="scoring-subhead">${escapeHtml(title)}</h3>
        ${note ? `<p class="scoring-note">${note}</p>` : ""}
        <table class="scoring-table">
            <thead>
                <tr><th>Plaats</th><th>Renner</th><th>Punten</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

}

function buildJerseySection(data) {

    const chips = JERSEY_FIELDS.map(jersey => {
        const riderUrl = data[jersey.field];
        if (!riderUrl) return "";
        return `
            <div class="jersey-chip jersey-chip--${jersey.cssClass}">
                <span class="jersey-chip-name">${jersey.label}</span>
                <span class="jersey-chip-rider">${escapeHtml(slugToName(riderUrl))}</span>
                <span class="jersey-chip-points">+${jersey.points} pts</span>
            </div>
        `;
    }).join("");

    return `
        <h3 class="scoring-subhead">Klassementstruien</h3>
        <div class="jersey-grid">${chips}</div>
    `;

}

function buildAggressiveRiderSection(riderUrl) {

    return `
        <h3 class="scoring-subhead">Meest aanvallende renner</h3>
        <table class="scoring-table">
            <thead>
                <tr><th>Renner</th><th>Punten</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td class="rider-name">${escapeHtml(slugToName(riderUrl))}</td>
                    <td>+${AGGRESSIVE_POINTS}</td>
                </tr>
            </tbody>
        </table>
    `;

}

function buildTakeoverSection(takeovers) {

    // Each entry is just a rider_url string — a takeover is worth a flat
    // +3 pts regardless of which jersey changed hands.
    const rows = takeovers.map(riderUrl => `
        <tr>
            <td class="rider-name">${escapeHtml(slugToName(riderUrl))}</td>
            <td>+${TAKEOVER_POINTS}</td>
        </tr>
    `).join("");

    return `
        <h3 class="scoring-subhead">Overname van een klassementstrui</h3>
        <table class="scoring-table">
            <thead>
                <tr><th>Renner</th><th>Punten</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

}

loadResults();

})();
