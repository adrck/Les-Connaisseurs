(function () {
"use strict";

let allRiders = [];
let riderSort = { key: "name", direction: "asc" };

async function initRiders() {

    const container = document.getElementById("riderList");
    const searchInput = document.getElementById("rider-search");

    if (!container) return;

    try {

        const ridersResponse = await fetch("data/riders.json");

        if (!ridersResponse.ok) {
            throw new Error("Unable to load riders.json");
        }

        allRiders = await ridersResponse.json();

        renderRiders();

        if (searchInput) {
            searchInput.addEventListener("input", renderRiders);
        }

    } catch (error) {
        container.innerHTML = "<p>Unable to load rider list.</p>";
        console.error(error);
    }

}

function sortRiders(key) {

    if (riderSort.key === key) {
        riderSort.direction = riderSort.direction === "asc" ? "desc" : "asc";
    } else {
        riderSort.key = key;
        riderSort.direction = "asc";
    }

    renderRiders();

}

function renderRiders() {

    const container = document.getElementById("riderList");
    const searchInput = document.getElementById("rider-search");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    let filtered = allRiders.filter(rider =>
        rider.name.toLowerCase().includes(query) ||
        rider.team.toLowerCase().includes(query)
    );

    const { key, direction } = riderSort;
    const dir = direction === "asc" ? 1 : -1;

    filtered = filtered.slice().sort((a, b) => {
        if (typeof a[key] === "number") {
            return (a[key] - b[key]) * dir;
        }
        return String(a[key]).localeCompare(String(b[key])) * dir;
    });

    const arrow = column =>
        riderSort.key === column ? (riderSort.direction === "asc" ? " \u25B2" : " \u25BC") : "";

    if (filtered.length === 0) {
        container.innerHTML = "<p>No riders match your search.</p>";
        return;
    }

    const rows = filtered.map(rider => `
        <tr>
            <td>${rider.name}</td>
            <td>${rider.team}</td>
            <td>${rider.bib}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th class="sortable" data-sort-key="name">Name${arrow("name")}</th>
                    <th class="sortable" data-sort-key="team">Team${arrow("team")}</th>
                    <th class="sortable" data-sort-key="bib">Bib${arrow("bib")}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

    container.querySelectorAll("th.sortable").forEach(th => {
        th.addEventListener("click", () => sortRiders(th.dataset.sortKey));
    });

}

initRiders();

})();
