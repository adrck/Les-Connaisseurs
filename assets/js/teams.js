(function () {
"use strict";

// Same Apps Script deployment used by the entry form (form.js).
// It needs a doGet() handler that returns the submitted teams as JSON:
// [{ "playerName": "Monique", "firstName": "Ellen", "riders": ["Tadej Pogačar", "Jonas Vingegaard", ...] }, ...]
// See README.md for the doGet() snippet to add on the Apps Script side.
const TEAMS_DATA_URL =
    "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec?action=teams";

// Team rosters (from the Apps Script / Sheet) store rider names in
// startlist convention: "SURNAME Firstname" - surname in caps, sometimes
// multiple words (e.g. "VAN AERT Wout", "FISHER-BLACK Finn"). But
// state.json's rider_points keys are generated in "Firstname Surname"
// order instead - confirmed against a real key: "rider/tadej-pogacar"
// for "POGACAR Tadej". This reorders before slugifying so points
// actually match. Heuristic (consumes leading all-caps word(s) as the
// surname) - not guaranteed for every edge case, per the earlier project
// note that slugs and startlist names don't always reliably match.
function reorderLastnameFirst(rawName) {
    const words = rawName.trim().split(/\s+/);
    let splitIndex = 0;
    while (splitIndex < words.length && words[splitIndex] === words[splitIndex].toUpperCase()) {
        splitIndex++;
    }
    if (splitIndex === 0 || splitIndex >= words.length) return rawName;
    const surname = words.slice(0, splitIndex).join(" ");
    const firstname = words.slice(splitIndex).join(" ");
    return firstname + " " + surname;
}

function slugifyName(name) {
    return "rider/" + reorderLastnameFirst(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
}

// entriesOpen in settings.json is a deadline timestamp (ISO 8601 string),
// not a boolean - same logic as form.js and the Apps Script, kept here
// too since this page has its own separate open/closed check. Fails open
// (returns true = still open) if the value is missing or unparseable.
function isEntriesOpen(settings) {
    if (!settings || !settings.entriesOpen) return true;
    const deadline = new Date(settings.entriesOpen);
    if (isNaN(deadline.getTime())) return true;
    return new Date() < deadline;
}

function renderEntryCounter(count) {
    const container = document.getElementById("teamsList");
    const plural = count === 1 ? "" : "s";
    const verb = count === 1 ? "heeft" : "hebben";
    container.innerHTML = `
        <p class="entries-counter">${count} deelnemer${plural} ${verb} al een team ingediend.</p>
        <p>Teams zijn zichtbaar zodra inschrijvingen zijn gesloten.</p>
    `;
}

async function initTeams() {

    const container = document.getElementById("teamsList");

    if (!container) return;

    try {

        const settingsResponse = await fetch("data/settings.json");
        const settings = settingsResponse.ok ? await settingsResponse.json() : {};

        if (isEntriesOpen(settings)) {
            const teamsResponse = await fetch(TEAMS_DATA_URL);
            const teams = teamsResponse.ok ? await teamsResponse.json() : [];
            renderEntryCounter(Array.isArray(teams) ? teams.length : 0);
            return;
        }

        let state = {};
        try {
            const stateResponse = await fetch("data/state.json");
            if (stateResponse.ok) state = await stateResponse.json();
        } catch (error) {
            // data/state.json missing, empty, or malformed - don't let this
            // take down the whole Teams page. Team rosters (from the Apps
            // Script) are independent of this file, so fall back to no
            // point totals rather than showing a misleading error.
            console.error("Kon data/state.json niet lezen, ga verder zonder puntentotalen:", error);
        }
        const riderPoints = state.rider_points || {};

        const latestStage = state.stages_processed && state.stages_processed.length
            ? Math.max(...state.stages_processed)
            : null;

        const teamTotals = latestStage && state.leaderboard_history
            ? (state.leaderboard_history[latestStage] || {})
            : {};

        const teamsResponse = await fetch(TEAMS_DATA_URL);

        if (!teamsResponse.ok) {
            throw new Error("Kan de ingediende teams niet laden");
        }

        const teams = await teamsResponse.json();

        renderTeams(teams, riderPoints, teamTotals, settings.teamSize || 20);
        renderRiderOwnership(teams, riderPoints);

    } catch (error) {
        container.innerHTML = `
            <p>Team rosters aren't available yet.</p>
            <p>Check that the Apps Script deployment has a <code>doGet()</code>
            handler set up (see README.md).</p>
        `;
        console.error(error);
    }

}

function renderTeams(teams, riderPoints, teamTotals, teamSize) {

    const container = document.getElementById("teamsList");

    if (!Array.isArray(teams) || teams.length === 0) {
        container.innerHTML = "<p>Er zijn nog geen teams ingediend.</p>";
        return;
    }

    const sorted = teams.slice().sort((a, b) => {
        const totalA = teamTotals[a.playerName] ?? 0;
        const totalB = teamTotals[b.playerName] ?? 0;
        return totalB - totalA;
    });

    container.innerHTML = sorted.map(team => {

        const riders = team.riders || [];
        const activeRiders = riders.slice(0, teamSize);
        const benchRiders = riders.slice(teamSize);

        const riderRow = riderName => {
            const points = riderPoints[slugifyName(riderName)] || 0;
            return `<li>${riderName} <span class="points-tag">${points} pts</span></li>`;
        };

        const activeRows = activeRiders.map(riderRow).join("");
        const benchRows = benchRiders.map(riderRow).join("");

        const total = teamTotals[team.playerName];
        const totalLabel = total !== undefined ? `${total} pts` : "";
        const firstNameLabel = team.firstName ? ` (${team.firstName})` : "";

        return `
            <div class="team-card">
                <h3>${team.playerName}${firstNameLabel} <span class="team-total">${totalLabel}</span></h3>
                <ul class="team-riders">
                    ${activeRows}
                </ul>
                ${benchRiders.length ? `
                    <div class="team-bench-heading">Wisselrenners</div>
                    <ul class="team-riders team-riders--bench">
                        ${benchRows}
                    </ul>
                ` : ""}
            </div>
        `;

    }).join("");

}

function computeRiderOwnership(teams, riderPoints) {

    const ownership = {};

    teams.forEach(team => {
        (team.riders || []).forEach(riderName => {
            if (!ownership[riderName]) {
                ownership[riderName] = {
                    riderName,
                    players: [],
                    points: riderPoints[slugifyName(riderName)] || 0
                };
            }
            ownership[riderName].players.push(team.playerName);
        });
    });

    return Object.values(ownership).sort((a, b) => {
        if (b.players.length !== a.players.length) {
            return b.players.length - a.players.length;
        }
        return b.points - a.points;
    });

}

function renderRiderOwnership(teams, riderPoints) {

    const teamsContainer = document.getElementById("teamsList");
    if (!teamsContainer) return;

    let section = document.getElementById("riderOwnership");

    if (!section) {
        section = document.createElement("div");
        section.id = "riderOwnership";
        section.className = "rider-overview";
        teamsContainer.insertAdjacentElement("afterend", section);
    }

    const ownership = computeRiderOwnership(teams, riderPoints);

    if (ownership.length === 0) {
        section.innerHTML = "";
        return;
    }

    const rows = ownership.map(o => `
        <tr>
            <td>${o.riderName}</td>
            <td>${o.players.join(", ")}</td>
            <td>${o.players.length}x</td>
            <td>${o.points} pts</td>
        </tr>
    `).join("");

    section.innerHTML = `
        <h3 class="scoring-subhead">Totaaloverzicht Les Connaisseurs</h3>
        <table class="rider-overview-table">
            <thead>
                <tr>
                    <th>Renner</th>
                    <th>Deelnemers</th>
                    <th>#</th>
                    <th>Punten</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

initTeams();

})();
