(function () {
"use strict";

// Same Apps Script deployment used by the entry form (form.js).
// It needs a doGet() handler that returns the submitted teams as JSON:
// [{ "playerName": "Monique", "riders": ["Tadej Pogačar", "Jonas Vingegaard", ...] }, ...]
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

        renderTeams(teams, riderPoints, teamTotals);

    } catch (error) {
        container.innerHTML = `
            <p>Team rosters aren't available yet.</p>
            <p>Check that the Apps Script deployment has a <code>doGet()</code>
            handler set up (see README.md).</p>
        `;
        console.error(error);
    }

}

function renderTeams(teams, riderPoints, teamTotals) {

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

        const riderRows = (team.riders || []).map(riderName => {
            const points = riderPoints[slugifyName(riderName)] || 0;
            return `<li>${riderName} <span class="points-tag">${points} pts</span></li>`;
        }).join("");

        const total = teamTotals[team.playerName];
        const totalLabel = total !== undefined ? `${total} pts` : "";

        return `
            <div class="team-card">
                <h3>${team.playerName} <span class="team-total">${totalLabel}</span></h3>
                <ul class="team-riders">
                    ${riderRows}
                </ul>
            </div>
        `;

    }).join("");

}

initTeams();

})();
