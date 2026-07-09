let allRiders = [];
let riderSort = { key: "points", direction: "desc" };

function slugifyRiderName(name) {
    return "rider/" + name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // strip accents
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
}

async function initRiders() {

    const container = document.getElementById("riderList");
    const searchInput = document.getElementById("rider-search");

    if (!container) return;

    try {

        const [ridersResponse, stateResponse] = await Promise.all([
            fetch("data/riders.json"),
            fetch("data/state.json")
        ]);

        if (!ridersResponse.ok) {
            throw new Error("Unable to load riders.json");
        }

        const riders = await ridersResponse.json();
        let riderPoints = {};

        if (stateResponse.ok) {
            const state = await stateResponse.json();
            riderPoints = state.rider_points || {};
        }

        allRiders = riders.map(rider => ({
            ...rider,
            points: riderPoints[slugifyRiderName(rider.name)] || 0
        }));

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
        riderSort.direction = key === "points" ? "desc" : "asc";
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
            <td>${rider.points}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th class="sortable" onclick="sortRiders('name')">Name${arrow("name")}</th>
                    <th class="sortable" onclick="sortRiders('team')">Team${arrow("team")}</th>
                    <th class="sortable" onclick="sortRiders('bib')">Bib${arrow("bib")}</th>
                    <th class="sortable" onclick="sortRiders('points')">Points${arrow("points")}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

initRiders();
