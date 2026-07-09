const TEAM_SIZE = 8;

let riders = [];

async function initForm() {
    const form = document.getElementById("team-form");

    if (!form) return;

    try {
        const response = await fetch("data/riders.json");

        if (!response.ok) {
            throw new Error("Unable to load riders.json");
        }

        riders = await response.json();

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

    selects.forEach(select => {

        if (!select.value) return;

        const count = selected.filter(name => name === select.value).length;

        if (count > 1) {
            duplicates = true;
            select.classList.add("duplicate");
        }

    });

    const valid =
        playerName !== "" &&
        selected.length === TEAM_SIZE &&
        !duplicates;

    submitButton.disabled = !valid;
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
