(function () {
"use strict";

// Tier-2 rewrite: team storage moved from the Google Apps Script + Sheet
// to Supabase (see supabase/schema.sql). Identity is now a real logged-in
// session (window.supabaseClient, set up in supabase-client.js) instead
// of a teamnaam+PIN lookup - the PIN field and the Apps Script lookup/
// submit calls are gone. Claiming an old pre-migration team by its old
// teamnaam+PIN is a one-time flow on the account page (account.js), not
// here - by the time someone reaches this page, either they already have
// a team row (loaded below) or they're starting a brand new one.

let TEAM_SIZE = 20;
let BENCH_SIZE = 3;
let MAX_SWAPS = 3;
let EXPECTED_RIDER_COUNT = null;
let entriesOpen = true;

// Best-effort inference of "the stage a swap made right now should be
// tagged with", read from data/state.json's stages_processed (the same
// field teams.js already uses to find "the latest scored stage" - see
// its `latestStage` calculation). This assumes a swap made now applies
// starting the NEXT stage that hasn't been scored yet. The previous
// Apps Script backend calculated this server-side and its exact logic
// was never visible to this rewrite - ASSUMPTION, please verify against
// a couple of real swaps before trusting this for scoring. See
// SETUP_GUIDE.md's "Things to double-check before trusting this with
// real swaps" section.
let CURRENT_STAGE = 1;

let riders = [];
let selectedRiders = []; // array of rider names, in order: first TEAM_SIZE = active, rest = bench
let isExistingTeam = false;
let teamRowId = null;
let existingSwaps = []; // swaps already on the loaded team row, kept as-is and appended to
let originalActiveSet = null; // Set of active rider names as loaded, once entriesOpen is false
let swapsUsedSoFar = 0;
let openSwapPickerFor = null; // name of the active rider whose "wissel" picker is currently expanded, or null

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

// Pairs up riders who left the active set with riders who newly entered
// it, to build {stage, swap_out, swap_in} entries in the same shape
// teams.json already used. Order of pairing is arbitrary among this
// edit's changes (the count is what matters for the cost/limit rules).
function buildNewSwapEntries() {
    if (!originalActiveSet) return [];
    const currentActive = new Set(selectedRiders.slice(0, TEAM_SIZE));

    const outs = [];
    originalActiveSet.forEach(name => {
        if (!currentActive.has(name)) outs.push(name);
    });

    const ins = [];
    currentActive.forEach(name => {
        if (!originalActiveSet.has(name)) ins.push(name);
    });

    const entries = [];
    for (let i = 0; i < outs.length; i++) {
        entries.push({
            stage: CURRENT_STAGE,
            swap_out: outs[i],
            swap_in: ins[i] !== undefined ? ins[i] : null
        });
    }
    return entries;
}

async function initForm() {
    const gateEl = document.getElementById("enter-gate");
    const contentEl = document.getElementById("enter-content");
    const form = document.getElementById("team-form");

    if (!form) return;

    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (!session) {
        gateEl.style.display = "";
        contentEl.style.display = "none";
        document.getElementById("enter-gate-link").addEventListener("click", (event) => {
            event.preventDefault();
            loadPage("account");
        });
        return;
    }

    gateEl.style.display = "none";
    contentEl.style.display = "";

    try {
        const [settingsResponse, ridersResponse, stateResponse] = await Promise.all([
            fetch("data/settings.json"),
            fetch("data/riders.json"),
            fetch("data/state.json")
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
                // Idempotency guard: initForm() is only ever supposed to
                // run once per real page visit, but a stable id lets this
                // insert survive safely even if something outside this
                // file somehow triggers a second run (loadPage("enter")
                // called twice, a duplicated event listener elsewhere,
                // etc.) - without this, each run would append its own
                // copy of the notice, since document.createElement()
                // always makes a brand new node regardless of how many
                // already exist. (Real-world trigger found and fixed
                // 2026-09-14: account.js was re-attaching a click listener
                // on "Ga naar Mijn Team" every render() call instead of
                // once - see account.js. This guard is a second, unrelated
                // layer of protection, not a substitute for that fix.)
                if (!document.getElementById("entries-closed-notice")) {
                    const notice = document.createElement("p");
                    notice.id = "entries-closed-notice";
                    notice.className = "form-message";
                    notice.style.color = "var(--oro)";
                    notice.style.fontWeight = "bold";
                    notice.textContent =
                        `Inschrijvingen zijn gesloten — er kunnen geen nieuwe teams meer worden ` +
                        `aangemeld. Je kunt nog tot ${MAX_SWAPS}x wisselen tussen je actieve team en je ` +
                        `wisselrenners (met een oplopende puntenaftrek per wissel).`;
                    document.querySelector(".rider-picker").insertAdjacentElement("beforebegin", notice);
                }

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

        if (stateResponse.ok) {
            try {
                const state = await stateResponse.json();
                if (Array.isArray(state.stages_processed) && state.stages_processed.length) {
                    CURRENT_STAGE = Math.max(...state.stages_processed) + 1;
                }
            } catch (error) {
                console.error("Kon data/state.json niet lezen voor het bepalen van de huidige etappe:", error);
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

        await loadExistingTeam(session);

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
            .getElementById("rider-search-input")
            .addEventListener("input", renderAvailableList);

        form.addEventListener("submit", submitForm);

    } catch (error) {
        document.querySelector(".rider-picker").innerHTML =
            `<p>Unable to load rider list.</p>`;

        console.error(error);
    }
}

function getFirstNameValue() {
    return document.getElementById("player-firstname").value.trim();
}

function getNameValue() {
    return document.getElementById("player-name").value.trim();
}

// Loads the current user's team row, if they already have one. Replaces
// the old name+PIN lookup entirely - identity is the session now, so
// there's nothing to "look up", just a single row (or none) to fetch.
async function loadExistingTeam(session) {

    const lookupMessage = document.getElementById("lookup-message");

    const { data: team, error } = await window.supabaseClient
        .from("teams")
        .select("id, first_name, player_name, riders, swaps")
        .eq("user_id", session.user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        lookupMessage.style.color = "#c62828";
        lookupMessage.style.fontWeight = "bold";
        lookupMessage.textContent = "Kon je team niet laden. Probeer de pagina te verversen.";
        return;
    }

    if (!team) {
        isExistingTeam = false;
        teamRowId = null;
        existingSwaps = [];
        originalActiveSet = null;

        lookupMessage.style.color = entriesOpen ? "#555" : "#c62828";
        lookupMessage.style.fontWeight = entriesOpen ? "normal" : "bold";
        lookupMessage.textContent = entriesOpen
            ? "Nieuw team — Kies hieronder je renners."
            : "Je hebt nog geen team, en inschrijvingen zijn gesloten. Er kan geen nieuw team meer worden aangemeld.";
        return;
    }

    isExistingTeam = true;
    teamRowId = team.id;
    existingSwaps = Array.isArray(team.swaps) ? team.swaps : [];
    swapsUsedSoFar = existingSwaps.length;

    document.getElementById("player-firstname").value = team.first_name || "";
    document.getElementById("player-name").value = team.player_name || "";
    selectedRiders = Array.isArray(team.riders) ? team.riders.slice(0, totalSize()) : [];
    originalActiveSet = entriesOpen ? null : new Set(selectedRiders.slice(0, TEAM_SIZE));
    openSwapPickerFor = null;

    lookupMessage.style.color = "#2e7d32";
    lookupMessage.style.fontWeight = "bold";
    lookupMessage.textContent = entriesOpen
        ? "Jouw team is geladen — pas het aan en kies Update team."
        : `Jouw team is geladen. Je hebt ${Math.max(0, MAX_SWAPS - swapsUsedSoFar)} van ` +
          `de ${MAX_SWAPS} wissels nog over. Verplaats renners met de pijltjes om een ` +
          `wisselrenner actief te maken (of andersom).`;

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

// Opens (or closes) the small "who from the bench comes in" picker
// attached to one active rider - see renderSelectedList(). Only one open
// at a time: opening a second one implicitly closes whichever was already
// open, so the list doesn't fill up with picker panels.
function toggleSwapPicker(name) {

    openSwapPickerFor = (openSwapPickerFor === name) ? null : name;

    renderSelectedList();

}

// Directly exchanges one active rider with one bench rider in a single
// step, instead of walking a rider down one position at a time with
// moveRider() - added after real feedback that moving a rider from near
// the top of a 20-person active list all the way to the bench took
// upwards of 19 clicks. Everyone else's relative order is untouched; only
// these two positions change.
function swapRiders(activeName, benchName) {

    const activeIndex = selectedRiders.indexOf(activeName);
    const benchIndex = selectedRiders.indexOf(benchName);

    if (activeIndex === -1 || benchIndex === -1) return;

    selectedRiders[activeIndex] = benchName;
    selectedRiders[benchIndex] = activeName;

    openSwapPickerFor = null;

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

    // Only active riders (index < TEAM_SIZE) get a swap button, and only
    // when there's actually a bench to swap with - an incomplete
    // selection (still being built, entries open) can have zero bench
    // riders yet.
    const hasBench = selectedRiders.length > TEAM_SIZE;

    container.innerHTML = selectedRiders.map((name, index) => {

        const isBench = index >= TEAM_SIZE;
        const escapedName = name.replace(/"/g, "&quot;");
        const dividerBefore = index === TEAM_SIZE
            ? `<div class="rider-bench-divider">Wisselrenners (bank)</div>`
            : "";

        const canSwap = !isBench && hasBench;
        const pickerOpen = canSwap && openSwapPickerFor === name;

        const swapButton = canSwap ? `
                <button
                    type="button"
                    class="rider-chip-swap"
                    data-rider-name="${escapedName}"
                    aria-label="Wissel ${name} met een wisselrenner"
                    aria-expanded="${pickerOpen ? "true" : "false"}"
                >&#8646;</button>` : "";

        const swapPicker = pickerOpen ? `
            <div class="rider-swap-picker">
                <span class="rider-swap-picker-label">Wissel ${name} in voor:</span>
                ${selectedRiders.slice(TEAM_SIZE).map(benchName => `
                    <button
                        type="button"
                        class="rider-swap-option"
                        data-active-name="${escapedName}"
                        data-bench-name="${benchName.replace(/"/g, "&quot;")}"
                    >${benchName}</button>
                `).join("")}
                <button type="button" class="rider-swap-cancel" data-active-name="${escapedName}">Annuleren</button>
            </div>
        ` : "";

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
                ${swapButton}
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
            ${swapPicker}
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

    container.querySelectorAll(".rider-chip-swap").forEach(button => {
        button.addEventListener("click", () => toggleSwapPicker(button.dataset.riderName));
    });

    container.querySelectorAll(".rider-swap-option").forEach(button => {
        button.addEventListener("click", () => swapRiders(button.dataset.activeName, button.dataset.benchName));
    });

    container.querySelectorAll(".rider-swap-cancel").forEach(button => {
        button.addEventListener("click", () => toggleSwapPicker(button.dataset.activeName));
    });

}

function validateForm() {

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    const counterEl = document.getElementById("selection-counter");

    const firstName = getFirstNameValue();
    const playerName = getNameValue();

    const valid =
        firstName !== "" &&
        playerName !== "" &&
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

    let newSwapEntries = [];

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
            // by the scoring pipeline, this is just so the player knows
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

            newSwapEntries = buildNewSwapEntries();
        }
    }

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");
    const wasUpdate = isExistingTeam;
    submitButton.disabled = true;
    submitButton.textContent = wasUpdate ? "Updating..." : "Submitting...";

    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (!session) {
        alert("Je sessie is verlopen. Log opnieuw in.");
        submitButton.disabled = false;
        validateForm();
        return;
    }

    const rowData = {
        first_name: getFirstNameValue(),
        player_name: getNameValue(),
        riders: selectedRiders
    };

    try {

        let error;

        if (wasUpdate) {
            rowData.swaps = existingSwaps.concat(newSwapEntries);
            ({ error } = await window.supabaseClient
                .from("teams")
                .update(rowData)
                .eq("id", teamRowId));
        } else {
            rowData.swaps = [];
            rowData.user_id = session.user.id;
            rowData.claimed = true;
            ({ error } = await window.supabaseClient
                .from("teams")
                .insert(rowData));
        }

        if (!error) {

            alert(wasUpdate
                ? "Jouw team is succesvol bijgewerkt!"
                : "Jouw team is succesvol ingediend!");

            await loadExistingTeam(session);
            openSwapPickerFor = null;
            const swapEl = document.getElementById("swap-counter");
            if (swapEl) swapEl.textContent = "";
            renderAvailableList();
            renderSelectedList();

        } else {

            console.error(error);
            formMessage.style.color = "#c62828";
            formMessage.style.fontWeight = "bold";
            formMessage.textContent = error.message || "Indienen mislukt.";

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
