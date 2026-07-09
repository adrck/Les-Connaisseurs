(function () {
"use strict";

let TEAM_SIZE = 20;

let riders = [];
let selectedRiders = []; // array of rider names, in the order picked

async function initForm() {
    const form = document.getElementById("team-form");

    if (!form) return;

    try {
        const [settingsResponse, ridersResponse] = await Promise.all([
            fetch("data/settings.json"),
            fetch("data/riders.json")
        ]);

        if (settingsResponse.ok) {
            const settings = await settingsResponse.json();

            if (settings.teamSize) {
                TEAM_SIZE = settings.teamSize;
            }

            if (settings.entriesOpen === false) {
                document.querySelector(".rider-picker").innerHTML =
                    "<p>Entries are currently closed.</p>";
                document.getElementById("player-name").disabled = true;
                document.getElementById("submit-btn").disabled = true;
                return;
            }
        }

        if (!ridersResponse.ok) {
            throw new Error("Unable to load riders.json");
        }

        riders = await ridersResponse.json();

        riders.sort((a, b) => a.name.localeCompare(b.name));

        const headingCount = document.getElementById("riders-heading-count");
        if (headingCount) {
            headingCount.textContent = TEAM_SIZE;
        }

        renderAvailableList();
        renderSelectedList();
        validateForm();

        document
            .getElementById("player-name")
            .addEventListener("input", validateForm);

        document
            .getElementById("rider-search-input")
            .addEventListener("input", renderAvailableList);

        form.addEventListener("submit", submitForm);

    } catch (error) {
        document.querySelector(".rider-picker").innerHTML =
            `<p>Unable to load rider list.</p>`;

        console.error(error);
    }
}

function addRider(name) {

    if (selectedRiders.includes(name)) return;

    if (selectedRiders.length >= TEAM_SIZE) {
        const formMessage = document.getElementById("form-message");
        formMessage.textContent =
            `Your team is already full (${TEAM_SIZE} riders). Remove one to swap.`;
        return;
    }

    selectedRiders.push(name);

    renderAvailableList();
    renderSelectedList();
    validateForm();

}

function removeRider(name) {

    selectedRiders = selectedRiders.filter(riderName => riderName !== name);

    renderAvailableList();
    renderSelectedList();
    validateForm();

}

function renderAvailableList() {

    const container = document.getElementById("rider-available-list");
    const searchInput = document.getElementById("rider-search-input");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const available = riders.filter(rider =>
        !selectedRiders.includes(rider.name) &&
        (rider.name.toLowerCase().includes(query) ||
         rider.team.toLowerCase().includes(query))
    );

    if (available.length === 0) {
        container.innerHTML = query
            ? "<p class='rider-list-empty'>No riders match your search.</p>"
            : "<p class='rider-list-empty'>All riders have been added.</p>";
        return;
    }

    // Group remaining matches by team, same as before
    const teams = {};

    available.forEach(rider => {
        if (!teams[rider.team]) {
            teams[rider.team] = [];
        }
        teams[rider.team].push(rider);
    });

    container.innerHTML = Object.keys(teams)
        .sort()
        .map(teamName => {

            const rows = teams[teamName]
                .sort((a, b) => a.bib - b.bib)
                .map(rider => `
                    <button
                        type="button"
                        class="rider-option"
                        data-rider-name="${rider.name.replace(/"/g, "&quot;")}"
                    >
                        ${rider.name}
                    </button>
                `)
                .join("");

            return `
                <div class="rider-team-group">
                    <div class="rider-team-heading">${teamName}</div>
                    ${rows}
                </div>
            `;

        })
        .join("");

    container.querySelectorAll(".rider-option").forEach(button => {
        button.addEventListener("click", () => addRider(button.dataset.riderName));
    });

}

function renderSelectedList() {

    const container = document.getElementById("rider-selected-list");

    if (selectedRiders.length === 0) {
        container.innerHTML = "<p class='rider-list-empty'>No riders selected yet.</p>";
        return;
    }

    container.innerHTML = selectedRiders.map((name, index) => `
        <div class="rider-chip">
            <span class="rider-chip-index">${index + 1}</span>
            <span class="rider-chip-name">${name}</span>
            <button
                type="button"
                class="rider-chip-remove"
                data-rider-name="${name.replace(/"/g, "&quot;")}"
                aria-label="Remove ${name}"
            >
                &times;
            </button>
        </div>
    `).join("");

    container.querySelectorAll(".rider-chip-remove").forEach(button => {
        button.addEventListener("click", () => removeRider(button.dataset.riderName));
    });

}

function validateForm() {

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    const counterEl = document.getElementById("selection-counter");

    const playerName =
        document.getElementById("player-name").value.trim();

    const valid =
        playerName !== "" &&
        selectedRiders.length === TEAM_SIZE;

    submitButton.disabled = !valid;

    if (counterEl) {
        counterEl.textContent = `${selectedRiders.length} of ${TEAM_SIZE} riders selected`;
        counterEl.style.color = selectedRiders.length === TEAM_SIZE ? "#2e7d32" : "#0b5ed7";
    }

    if (selectedRiders.length < TEAM_SIZE || playerName !== "") {
        formMessage.textContent = "";
    }

}

async function submitForm(event) {

    event.preventDefault();

    const submission = {
        playerName: document.getElementById("player-name").value.trim(),
        email: document.getElementById("email").value.trim(),
        riders: selectedRiders
    };

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {

        const response = await fetch(
            "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec",
            {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(submission)
            }
        );

        const result = await response.json();

        if (result.success) {

            alert("Your team has been submitted successfully!");

            document.getElementById("team-form").reset();
            selectedRiders = [];
            renderAvailableList();
            renderSelectedList();
            validateForm();

        } else {

            alert("Submission failed.");

        }

    } catch (error) {

        console.error(error);
        alert("Unable to submit your team.");

    }

    submitButton.textContent = "Submit Team";
    validateForm();

}

window.requestAnimationFrame(() => {
    initForm();
});

})();
