(function () {
"use strict";

const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec";

let TEAM_SIZE = 20;

let riders = [];
let selectedRiders = []; // array of rider names, in the order picked
let isExistingTeam = false; // becomes true once a matching name+PIN is found
let lastLookupKey = ""; // "name|pin" for the most recently completed lookup

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
                document.getElementById("player-pin").disabled = true;
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
            .getElementById("player-pin")
            .addEventListener("input", validateForm);

        document
            .getElementById("player-pin")
            .addEventListener("blur", maybeLookupTeam);

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

function getPinValue() {
    return document.getElementById("player-pin").value.trim();
}

function getNameValue() {
    return document.getElementById("player-name").value.trim();
}

// Automatically checks for an existing team once both name and a valid
// 4-digit PIN are present. Runs on blur of the PIN field so it doesn't
// fire on every keystroke.
async function maybeLookupTeam() {

    const playerName = getNameValue();
    const pin = getPinValue();
    const lookupMessage = document.getElementById("lookup-message");

    if (playerName === "" || !/^[0-9]{4}$/.test(pin)) {
        return;
    }

    const key = playerName.toLowerCase() + "|" + pin;
    if (key === lastLookupKey) {
        return; // already looked this exact combination up
    }

    lookupMessage.style.color = "#555";
    lookupMessage.style.fontWeight = "normal";
    lookupMessage.textContent = "Checking for an existing team...";

    try {

        const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "lookup", playerName, pin })
        });

        const result = await response.json();
        lastLookupKey = key;

        if (!result.success) {

            isExistingTeam = false;
            lookupMessage.style.color = "#c62828";
            lookupMessage.style.fontWeight = "bold";
            lookupMessage.textContent = result.error ||
                "A team already exists under this name. Check your PIN, or use a different name.";

        } else if (result.exists) {

            isExistingTeam = true;

            selectedRiders = Array.isArray(result.riders) ? result.riders.slice(0, TEAM_SIZE) : [];
            if (result.email) {
                document.getElementById("email").value = result.email;
            }

            renderAvailableList();
            renderSelectedList();

            lookupMessage.style.color = "#2e7d32";
            lookupMessage.style.fontWeight = "bold";
            lookupMessage.textContent = "Loaded your existing team below — make changes and click Update Team.";

        } else {

            isExistingTeam = false;
            lookupMessage.style.color = "#555";
            lookupMessage.style.fontWeight = "normal";
            lookupMessage.textContent = "New player — pick your riders below.";

        }

        validateForm();

    } catch (error) {

        console.error(error);
        lookupMessage.style.color = "#c62828";
        lookupMessage.style.fontWeight = "bold";
        lookupMessage.textContent = "Couldn't check for an existing team. You can still fill in the form below.";

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

    const playerName = getNameValue();
    const pin = getPinValue();

    const valid =
        playerName !== "" &&
        /^[0-9]{4}$/.test(pin) &&
        selectedRiders.length === TEAM_SIZE;

    submitButton.disabled = !valid;
    submitButton.textContent = isExistingTeam ? "Update Team" : "Submit Team";

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
        playerName: getNameValue(),
        pin: getPinValue(),
        email: document.getElementById("email").value.trim(),
        riders: selectedRiders
    };

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    const wasUpdate = isExistingTeam;
    submitButton.disabled = true;
    submitButton.textContent = wasUpdate ? "Updating..." : "Submitting...";

    try {

        const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(submission)
        });

        const result = await response.json();

        if (result.success) {

            alert(wasUpdate
                ? "Your team has been updated successfully!"
                : "Your team has been submitted successfully!");

            document.getElementById("team-form").reset();
            selectedRiders = [];
            isExistingTeam = false;
            lastLookupKey = "";
            document.getElementById("lookup-message").textContent = "";
            renderAvailableList();
            renderSelectedList();

        } else {

            alert(result.error || "Submission failed.");

        }

    } catch (error) {

        console.error(error);
        alert("Unable to submit your team.");

    }

    validateForm();

}

window.requestAnimationFrame(() => {
    initForm();
});

})();
