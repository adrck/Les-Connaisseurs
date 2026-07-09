let TEAM_SIZE = 8;

let riders = [];

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
                document.getElementById("rider-selectors").innerHTML =
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

        buildSelectors();

        document
            .getElementById("player-name")
            .addEventListener("input", validateForm);

        form.addEventListener("submit", submitForm);

    } catch (error) {
        document.getElementById("rider-selectors").innerHTML =
            `<p>Unable to load rider list.</p>`;

        console.error(error);
    }
}

function buildSelectors() {

    const container = document.getElementById("rider-selectors");

    container.innerHTML = "";

    for (let i = 0; i < TEAM_SIZE; i++) {

        const group = document.createElement("div");
        group.className = "form-group";

        const label = document.createElement("label");
        label.textContent = `Rider ${i + 1}`;

        const select = document.createElement("select");
        select.className = "rider-select";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a rider...";
        placeholder.selected = true;

        select.appendChild(placeholder);

        // Group riders by team
const teams = {};

riders.forEach(rider => {

    if (!teams[rider.team]) {
        teams[rider.team] = [];
    }

    teams[rider.team].push(rider);

});

// Create an optgroup for each team
Object.keys(teams)
    .sort()
    .forEach(teamName => {

        const optgroup = document.createElement("optgroup");
        optgroup.label = teamName;

        teams[teamName]
            .sort((a, b) => a.bib - b.bib)
            .forEach(rider => {

                const option = document.createElement("option");

                option.value = rider.name;
                option.textContent = rider.name;

                optgroup.appendChild(option);

            });

        select.appendChild(optgroup);

    });

        select.addEventListener("change", () => {

            validateForm();

        });

        group.appendChild(label);
        group.appendChild(select);

        container.appendChild(group);

    }

    validateForm();

}

function validateForm() {

    const submitButton = document.getElementById("submit-btn");
    const formMessage = document.getElementById("form-message");

    const playerName =
        document.getElementById("player-name").value.trim();

    const selects =
        document.querySelectorAll(".rider-select");

    const selected = [];

    selects.forEach(select => {

        select.classList.remove("duplicate");

        if (select.value !== "") {
            selected.push(select.value);
        }

    });

    let duplicates = false;
const duplicateNames = [];

selects.forEach(select => {

    if (!select.value) return;

    const count = selected.filter(name => name === select.value).length;

    if (count > 1) {

        duplicates = true;
        select.classList.add("duplicate");

        if (!duplicateNames.includes(select.value)) {
            duplicateNames.push(select.value);
        }

    }

});

    const valid =
        playerName !== "" &&
        selected.length === TEAM_SIZE &&
        !duplicates;

    submitButton.disabled = !valid;

if (duplicates) {

    formMessage.textContent =
        "Duplicate rider" +
        (duplicateNames.length > 1 ? "s" : "") +
        ": " +
        duplicateNames.join(", ");

} else {

    formMessage.textContent = "";

}
}

async function submitForm(event) {

    event.preventDefault();

    const team = [];

    document
        .querySelectorAll(".rider-select")
        .forEach(select => team.push(select.value));

    const submission = {
        playerName: document.getElementById("player-name").value.trim(),
        email: document.getElementById("email").value.trim(),
        riders: team
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
