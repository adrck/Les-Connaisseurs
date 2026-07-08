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

function updateAvailableRiders() {

    const selects = document.querySelectorAll(".rider-select");

    const selected = [...selects]
        .map(select => select.value)
        .filter(value => value !== "");

    selects.forEach(currentSelect => {

        [...currentSelect.options].forEach(option => {

            if (option.value === "") {
                option.disabled = false;
                return;
            }

            option.disabled =
                selected.includes(option.value) &&
                option.value !== currentSelect.value;

        });

    });

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
        placeholder.textContent = "-- Select a rider --";

        select.appendChild(placeholder);

        riders.forEach(rider => {

            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Select a rider...";
            placeholder.selected = true;
            placeholder.disabled = true;

            select.appendChild(option);

        });

            select.addEventListener("change", () => {

    updateAvailableRiders();
    validateForm();

});
        group.appendChild(label);
        group.appendChild(select);

        container.appendChild(group);
    }

    updateAvailableRiders();
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

function submitForm(event) {

    event.preventDefault();

    const team = [];

    document
        .querySelectorAll(".rider-select")
        .forEach(select => {

            team.push(select.value);

        });

    const submission = {
        playerName: document.getElementById("player-name").value.trim(),
        email: document.getElementById("email").value.trim(),
        riders: team
    };

    console.log(submission);

    alert(
        "Form validation successful.\n\nNext step: send this data to Google Sheets."
    );
}

window.requestAnimationFrame(() => {
    initForm();
});
