(function () {
"use strict";

let leaderboardHistory = {};
let stageResults = {};
let stageOrder = [];

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
const TAKEOVER_POINTS = 3;
const AGGRESSIVE_POINTS = 5;

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
        .replace(/>/g, "&gt;");
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
        stageResults = results.stage_results || {};
        stageOrder = Object.keys(leaderboardHistory)
            .map(Number)
            .sort((a, b) => a - b);

        setupStageSelect();
        await setupJerseyTheme();

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

function displayLeaderboard(stage) {

    const leaderboard = leaderboardHistory[stage] || {};

    const stageIndex = stageOrder.indexOf(stage);
    const previousStage = stageIndex > 0 ? stageOrder[stageIndex - 1] : null;
    const previousLeaderboard = previousStage !== null
        ? (leaderboardHistory[previousStage] || {})
        : {};

    // Sort highest score first
    const standings = Object.entries(leaderboard)
        .sort((a, b) => b[1] - a[1]);

    const tbody = document.getElementById("leaderboard-body");

    tbody.innerHTML = "";

    standings.forEach(([player, points], index) => {

        const previousPoints = previousLeaderboard[player];
        let deltaLabel = "\u2014";

        if (previousPoints !== undefined) {
            const delta = points - previousPoints;
            deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
        }

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player}</td>
            <td>${points}</td>
            <td>${deltaLabel}</td>
        `;

        tbody.appendChild(row);

    });

}

function renderStageBreakdown(stage) {

    const container = document.getElementById("stage-breakdown-content");
    if (!container) return;

    const data = stageResults[stage];

    if (!data) {
        container.innerHTML = `<p class="scoring-note">Geen detailoverzicht beschikbaar voor etappe ${stage}.</p>`;
        return;
    }

    const parts = [];

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
        parts.push(`
            <h3 class="scoring-subhead">Meest aanvallende renner</h3>
            <p class="scoring-note">${escapeHtml(slugToName(data.most_aggressive_rider))} — +${AGGRESSIVE_POINTS} pts</p>
        `);
    }

    container.innerHTML = parts.join("\n");

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

function buildTakeoverSection(takeovers) {

    // Each entry is just a rider_url string — a takeover is worth a flat
    // +3 pts regardless of which jersey changed hands.
    const rows = takeovers.map(riderUrl => `
        <tr>
            <td>${escapeHtml(slugToName(riderUrl))}</td>
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
