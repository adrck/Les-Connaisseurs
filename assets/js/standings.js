
async function loadResults() {

    try {

        const response = await fetch("../data/state.json");

        if (!response.ok) {
            throw new Error("Unable to load results.");
        }

        const results = await response.json();

        displayLeaderboard(results);

    } catch (error) {

        console.error(error);

    }

}

function displayLeaderboard(results) {

    // Find the latest stage number
    const latestStage = Math.max(
        ...Object.keys(results.leaderboard_history).map(Number)
    );

    // Get the leaderboard for that stage
    const leaderboard = results.leaderboard_history[latestStage];

    // Sort highest score first
    const standings = Object.entries(leaderboard)
        .sort((a, b) => b[1] - a[1]);

    const tbody = document.getElementById("leaderboard-body");

    tbody.innerHTML = "";

    standings.forEach(([player, points], index) => {

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player}</td>
            <td>${points}</td>
        `;

        tbody.appendChild(row);

    });

}

document.addEventListener("DOMContentLoaded", loadResults);
