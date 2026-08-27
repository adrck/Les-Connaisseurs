(function () {
"use strict";

const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec";

let TEAM_SIZE = 20;
let BENCH_SIZE = 3;
let MAX_SWAPS = 3;
let EXPECTED_RIDER_COUNT = null;
let entriesOpen = true;

let riders = [];
let selectedRiders = []; // array of rider names, in order: first TEAM_SIZE = active, rest = bench
let isExistingTeam = false; // becomes true once a matching name+PIN is found
let lastLookupKey = ""; // "name|pin" for the most recently completed lookup
let originalActiveSet = null; // Set of active rider names as loaded, once entriesOpen is false
let swapsUsedSoFar = 0; // swaps already used in earlier sessions, from the lookup response

function totalSize() {
    return TEAM_SIZE + BENCH_SIZE;
}

// How many riders in the current selection differ from the active set as it
// was when this team was loaded - i.e. how many swaps this edit represents.
// Reordering purely within the bench (no boundary crossing) doesn't count.
function effectiveSwapsThisEdit() {
    if (!originalActiveSet) return 0;
    const currentActive = new Set(selectedRiders.slice(0, TEAM_SIZE));
    let count = 0;
    originalActiveSet.forEach(name => {
        if (!currentActive.has(name)) count++;
    });
    return count;
}

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

            if (settings.benchSize !== undefined) {
                BENCH_SIZE = settings.benchSize;
            }

            if (settings.maxSwaps !== undefined) {
                MAX_SWAPS = settings.maxSwaps;
            }

            if (settings.expectedRiderCount !== undefined) {
                EXPECTED_RIDER_COUNT = settings.expectedRiderCount;
            }

            // entriesOpen is now a deadline timestamp (ISO 8601 string, e.g.
            // "2026-08-24T18:00:00+02:00") rather than a plain boolean.
            // Entries are open as long as "now" is before that deadline.
            // If the value is missing or can't be parsed as a date, we fail
            // open (same behaviour as before, when the key was simply absent).
            if (settings.entriesOpen) {
                const deadline = new Date(settings.entriesOpen);
                if (!isNaN(deadline.getTime())) {
                    entriesOpen = new Date() < deadline;
                }
            }

            if (!entriesOpen) {
                const notice = document.createElement("p");
                notice.className = "form-message";
                notice.style.color = "var(--oro)";
                notice.style.fontWeight = "bold";
                notice.textContent =
                    `Inschrijvingen zijn gesloten — er kunnen geen nieuwe teams meer worden ` +
                    `aangemeld. Vul je Teamnaam + PIN in om je bestaande team te laden: je kunt ` +
                    `dan nog tot ${MAX_SWAPS}x wisselen tussen je actieve team en je ` +
                    `wisselrenners (met een oplopende puntenaftrek per wissel).`;
                document.querySelector(".rider-picker").insertAdjacentElement("beforebegin", notice);

                // No rider outside the 23 already on this team may be added
                // once entries are closed, and a rider can no longer be
                // fully removed either - the only valid change is moving one
                // across the active/bench boundary with the up/down arrows
                // (see moveRider()). So the "zoek renner" column, which only
                // ever adds riders from the full peloton, has nothing valid
                // left to do - hide it rather than leave dead UI that used
                // to let people delete a rider and strand their team one
                // rider short before finding a replacement.
                const searchColumn = document.getElementById("rider-search-column");
                if (searchColumn) searchColumn.style.display = "none";

                const pickerEl = document.querySelector(".rider-picker");
                if (pickerEl) pickerEl.classList.add("rider-picker--closed");
            }
        }

        if (!ridersResponse.ok) {
            throw new Error("Unable to load riders.json");
        }

        riders = await ridersResponse.json();

        riders.sort((a, b) => a.name.localeCompare(b.name));

        const confirmedCounter = document.getElementById("rider-confirmed-counter");
        if (confirmedCounter) {
            // riders.length = however many are in riders.json right now (this
            // grows over time as the startlist gets confirmed); the expected
            // total is a fixed number you already know, from settings.json -
            // not derived from riders.json, since that file's eventual count
            // IS that number, not something to compare it against itself.
            const expectedTotal = EXPECTED_RIDER_COUNT || riders.length;
            confirmedCounter.textContent = `(${riders.length} / ${expectedTotal} renners bevestigd)`;
        }

        const headingCount = document.getElementById("riders-heading-count");
        if (headingCount) {
            headingCount.textContent = totalSize();
        }

        renderAvailableList();
        renderSelectedList();
        validateForm();

        document
            .getElementById("player-firstname")
            .addEventListener("input", validateForm);

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

function getFirstNameValue() {
    return document.getElementById("player-firstname").value.trim();
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
    lookupMessage.textContent = "Controleer of er al een team bestaat...";

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
                "Er bestaat al een team met deze naam. Controleer de PIN, of gebruik een andere naam.";

        } else if (result.exists) {

            isExistingTeam = true;
            swapsUsedSoFar = result.swapsUsed || 0;

            document.getElementById("player-firstname").value = result.firstName || "";
            selectedRiders = Array.isArray(result.riders) ? result.riders.slice(0, totalSize()) : [];
            originalActiveSet = entriesOpen ? null : new Set(selectedRiders.slice(0, TEAM_SIZE));

            renderAvailableList();
            renderSelectedList();

            lookupMessage.style.color = "#2e7d32";
            lookupMessage.style.fontWeight = "bold";
            lookupMessage.textContent = entriesOpen
                ? "Bestaand team is geladen — maak je wijziging en kies Update team."
                : `Bestaand team is geladen. Je hebt ${Math.max(0, MAX_SWAPS - swapsUsedSoFar)} van ` +
                  `de ${MAX_SWAPS} wissels nog over. Verplaats renners met de pijltjes om een ` +
                  `wisselrenner actief te maken (of andersom).`;

        } else {

            isExistingTeam = false;
            originalActiveSet = null;
            lookupMessage.style.color = entriesOpen ? "#555" : "#c62828";
            lookupMessage.style.fontWeight = entriesOpen ? "normal" : "bold";
            lookupMessage.textContent = entriesOpen
                ? "Nieuw team — Kies hieronder je renners."
                : "Geen team gevonden met deze naam + PIN. Inschrijvingen zijn gesloten, dus er kan geen nieuw team meer worden aangemeld.";

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

    // Defense in depth: the "zoek renner" column that calls this is hidden
    // once entries are closed (see initForm), but guard here too in case
    // this ever gets called from somewhere else - no rider outside the
    // team's existing 23 may be added post-close.
    if (!entriesOpen) return;

    if (selectedRiders.includes(name)) return;

    if (selectedRiders.length >= totalSize()) {
        const formMessage = document.getElementById("form-message");
        formMessage.textContent =
            `Jouw team is al volledig (${TEAM_SIZE} actief + ${BENCH_SIZE} wissel = ${totalSize()} renners). Verwijder er een om te wisselen.`;
        return;
    }

    selectedRiders.push(name);

    renderAvailableList();
    renderSelectedList();
    validateForm();

}

function removeRider(name) {

    // Defense in depth: the remove (x) button is no longer rendered once
    // entries are closed (see renderSelectedList), but guard here too.
    // Fully removing a rider is a team-building action, not a swap - once
    // closed, moveRider() (crossing the active/bench boundary) is the only
    // valid way to change the roster, so the team is never left one rider
    // short mid-edit the way it could be when this was reachable.
    if (!entriesOpen) return;

    selectedRiders = selectedRiders.filter(riderName => riderName !== name);

    renderAvailableList();
    renderSelectedList();
    validateForm();

}

// Moves a rider up (-1) or down (+1) in the list. Crossing the boundary
// between position TEAM_SIZE and TEAM_SIZE+1 is how someone moves a rider
// from active to bench, or a bench rider into the active team.
function moveRider(name, direction) {

    const index = selectedRiders.indexOf(name);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= selectedRiders.length) return;

    const [rider] = selectedRiders.splice(index, 1);
    selectedRiders.splice(newIndex, 0, rider);

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
            ? "<p class='rider-list-empty'>Geen renners met deze zoekterm.</p>"
            : "<p class='rider-list-empty'>Alle renners zijn toegevoegd.</p>";
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
        container.innerHTML = "<p class='rider-list-empty'>Nog geen renners geselecteerd.</p>";
        return;
    }

    container.innerHTML = selectedRiders.map((name, index) => {

        const isBench = index >= TEAM_SIZE;
        const escapedName = name.replace(/"/g, "&quot;");
        const dividerBefore = index === TEAM_SIZE
            ? `<div class="rider-bench-divider">Wisselrenners (bank)</div>`
            : "";

        return `
            ${dividerBefore}
            <div class="rider-chip${isBench ? " rider-chip--bench" : ""}">
                <span class="rider-chip-index">${index + 1}</span>
                <span class="rider-chip-name">${name}</span>
                <div class="rider-chip-move">
                    <button
                        type="button"
                        class="rider-chip-move-up"
                        data-rider-name="${escapedName}"
                        aria-label="Verplaats ${name} omhoog"
                        ${index === 0 ? "disabled" : ""}
                    >&uarr;</button>
                    <button
                        type="button"
                        class="rider-chip-move-down"
                        data-rider-name="${escapedName}"
                        aria-label="Verplaats ${name} omlaag"
                        ${index === selectedRiders.length - 1 ? "disabled" : ""}
                    >&darr;</button>
                </div>
                ${entriesOpen ? `
                <button
                    type="button"
                    class="rider-chip-remove"
                    data-rider-name="${escapedName}"
                    aria-label="Remove ${name}"
                >
                    &times;
                </button>` : ""}
            </div>
        `;

    }).join("");

    container.querySelectorAll(".rider-chip-remove").forEach(button => {
        button.addEventListener("click", () => removeRider(button.dataset.riderName));
    });

    container.querySelectorAll(".rider-chip-move-up").forEach(button => {
        button.addEventListener("click", () => moveRider(button.dataset.riderName, -1));
    });

    container.querySelectorAll(".rider-chip-move-down").forEach(button => {
        button.addEventListener("click", () => moveRider(button.dataset.riderName, 1));
    });

}

function validateForm() {

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    const counterEl = document.getElementById("selection-counter");

    const firstName = getFirstNameValue();
    const playerName = getNameValue();
    const pin = getPinValue();

    const valid =
        firstName !== "" &&
        playerName !== "" &&
        /^[0-9]{4}$/.test(pin) &&
        selectedRiders.length > 0;

    submitButton.disabled = !valid;
    submitButton.textContent = isExistingTeam ? "Update Team" : "Bevestig Team";

    if (counterEl) {
        const total = totalSize();
        const complete = selectedRiders.length === total;
        const activeCount = Math.min(selectedRiders.length, TEAM_SIZE);
        const benchCount = Math.max(0, selectedRiders.length - TEAM_SIZE);
        const breakdown = `${activeCount} actief, ${benchCount} op de bank`;
        counterEl.textContent = complete
            ? `${selectedRiders.length} of ${total} renners geselecteerd (${breakdown})`
            : `${selectedRiders.length} of ${total} renners geselecteerd (${breakdown}) — nog niet compleet`;
        counterEl.style.color = complete ? "#2e7d32" : "var(--oro)";
    }

    if (selectedRiders.length < totalSize() || playerName !== "") {
        formMessage.textContent = "";
    }

    if (!entriesOpen && !isExistingTeam) {
        submitButton.disabled = true;
    }

    if (!entriesOpen && originalActiveSet) {
        const effectiveSwaps = effectiveSwapsThisEdit();
        const remaining = MAX_SWAPS - swapsUsedSoFar - effectiveSwaps;
        const swapEl = document.getElementById("swap-counter") || (() => {
            const el = document.createElement("p");
            el.id = "swap-counter";
            el.className = "form-message";
            counterEl.insertAdjacentElement("afterend", el);
            return el;
        })();
        if (effectiveSwaps > 0) {
            swapEl.style.color = remaining < 0 ? "#c62828" : "var(--oro)";
            swapEl.style.fontWeight = "bold";
            swapEl.textContent = remaining < 0
                ? `Dit is ${effectiveSwaps} wissels — je hebt nog maar ${Math.max(0, MAX_SWAPS - swapsUsedSoFar)} over. Zet er een terug.`
                : `Dit is ${effectiveSwaps} wissel${effectiveSwaps === 1 ? "" : "s"} deze bewerking — daarna nog ${remaining} over.`;
            if (remaining < 0) {
                submitButton.disabled = true;
            }
        } else {
            swapEl.textContent = "";
        }
    }

}

async function submitForm(event) {

    event.preventDefault();

    if (!entriesOpen && !isExistingTeam) {
        alert("Inschrijvingen zijn gesloten — er kunnen geen nieuwe teams meer worden aangemeld.");
        return;
    }

    if (entriesOpen && selectedRiders.length < totalSize()) {
        const proceed = window.confirm(
            `Je hebt nog maar ${selectedRiders.length} van de ${totalSize()} renners gekozen ` +
            `(${TEAM_SIZE} actief + ${BENCH_SIZE} wissel). Je team meedoet met minder renners is ` +
            `toegestaan, maar het is jouw eigen verantwoordelijkheid om op tijd (voor het sluiten ` +
            `van de inschrijvingen) een compleet team te kiezen.\n\n` +
            `Toch indienen met ${selectedRiders.length} renners?`
        );
        if (!proceed) {
            return;
        }
    }

    if (!entriesOpen) {
        const effectiveSwaps = effectiveSwapsThisEdit();
        const remaining = MAX_SWAPS - swapsUsedSoFar - effectiveSwaps;

        if (remaining < 0) {
            alert(
                `Dit zijn ${effectiveSwaps} wissels, maar je hebt nog maar ` +
                `${Math.max(0, MAX_SWAPS - swapsUsedSoFar)} over. Zet een renner terug voordat je indient.`
            );
            return;
        }

        if (effectiveSwaps > 0) {
            // Indicative only - the actual point deduction is calculated
            // server-side (scoring.py), this is just so the player knows
            // roughly what to expect before confirming.
            const costTable = [5, 10, 15];
            let cost = 0;
            for (let i = swapsUsedSoFar; i < swapsUsedSoFar + effectiveSwaps; i++) {
                cost += costTable[i] !== undefined ? costTable[i] : costTable[costTable.length - 1];
            }

            const proceed = window.confirm(
                `Je voert ${effectiveSwaps} wissel${effectiveSwaps === 1 ? "" : "s"} door. ` +
                `Dat kost ongeveer ${cost} punten (oplopend per wissel). Daarna heb je nog ` +
                `${remaining} van de ${MAX_SWAPS} wissels over voor de rest van de wedstrijd.\n\n` +
                `Wissel doorvoeren?`
            );
            if (!proceed) {
                return;
            }
        }
    }

    const submission = {
        firstName: getFirstNameValue(),
        playerName: getNameValue(),
        pin: getPinValue(),
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
                ? (result.message || "Jouw team is succesvol bijgewerkt!")
                : "Jouw team is succesvol ingediend!");

            document.getElementById("team-form").reset();
            selectedRiders = [];
            isExistingTeam = false;
            lastLookupKey = "";
            originalActiveSet = null;
            swapsUsedSoFar = 0;
            document.getElementById("lookup-message").textContent = "";
            const swapEl = document.getElementById("swap-counter");
            if (swapEl) swapEl.textContent = "";
            renderAvailableList();
            renderSelectedList();

        } else {

            alert(result.error || "Indienen mislukt.");

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
