(function () {
"use strict";

// Same Apps Script deployment used by the entry form (form.js).
// It needs a doGet() handler that returns the submitted teams as JSON:
// [{ "playerName": "Monique", "firstName": "Ellen", "riders": ["Tadej Pogačar", "Jonas Vingegaard", ...] }, ...]
// See README.md for the doGet() snippet to add on the Apps Script side.
const TEAMS_DATA_URL =
    "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec?action=teams";

function slugifyName(name) {
    return "rider/" + name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
}

async function initTeams() {

    const container = document.getElementById("teamsList");

    if (!container) return;

    try {

        const settingsResponse = await fetch("data/settings.json");
        const settings = settingsResponse.ok ? await settingsResponse.json() : {};

        if (settings.entriesOpen !== false) {
            container.innerHTML = `
                <p>Teams zijn zichtbaar zodra inschrijvingen zijn gesloten.</p>
            `;
            return;
        }

        const stateResponse = await fetch("data/state.json");
        const state = stateResponse.ok ? await stateResponse.json() : {};
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
