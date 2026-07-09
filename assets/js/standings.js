(function () {
"use strict";

let leaderboardHistory = {};
let stageOrder = [];

async function loadResults() {

    try {

        const response = await fetch("data/state.json");

        if (!response.ok) {
            throw new Error("Unable to load results.");
        }

        const results = await response.json();

        leaderboardHistory = results.leaderboard_history || {};
        stageOrder = Object.keys(leaderboardHistory)
            .map(Number)
            .sort((a, b) => a - b);

        setupStageSelect();

        const latestStage = stageOrder[stageOrder.length - 1];
        displayLeaderboard(latestStage);

    } catch (error) {
        const tbody = document.getElementById("leaderboard-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4">Unable to load standings.</td></tr>`;
        }
        console.error(error);
    }

}

function setupStageSelect() {

    const select = document.getElementById("stage-select");

    if (!select) return;

    select.innerHTML = stageOrder
        .map(stage => `<option value="${stage}">After stage ${stage}</option>`)
        .join("");

    select.value = stageOrder[stageOrder.length - 1];

    select.addEventListener("change", () => {
        displayLeaderboard(Number(select.value));
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

loadResults();

})();
