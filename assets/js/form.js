const TEAM_SIZE = 8;
const BUDGET = 120;

let riders = [];

async function initForm() {

    const response = await fetch("data/riders.json");

    riders = await response.json();

    buildSelectors();

    document
        .getElementById("teamForm")
        .addEventListener("submit", submitForm);

}

function buildSelectors() {

    const container = document.getElementById("riderSelections");

    container.innerHTML = "";

    for (let i = 1; i <= TEAM_SIZE; i++) {

        const label = document.createElement("label");

        label.textContent = `Rider ${i}`;

        const input = document.createElement("input");

        input.type = "text";

        input.setAttribute("list", `riders${i}`);

        input.className = "riderInput";

        input.placeholder = "Start typing a rider...";

        input.addEventListener("input", updateBudget);

        const datalist = document.createElement("datalist");

        datalist.id = `riders${i}`;

        riders.forEach(rider => {

            const option = document.createElement("option");

            option.value = rider.name;

            datalist.appendChild(option);

        });

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(datalist);

    }

}

function updateBudget() {

    let total = 0;

    let selected = [];

    document.querySelectorAll(".riderInput").forEach(input => {

        const rider = riders.find(r => r.name === input.value);

        if (!rider)
            return;

        total += rider.price;

        selected.push(rider.name);

    });

    document.getElementById("totalCost").textContent = total;

    document.getElementById("remainingBudget").textContent = BUDGET - total;

    validate(selected, total);

}

function validate(selected, total) {

    const unique = new Set(selected);

    const valid =
        document.getElementById("playerName").value.trim() !== "" &&
        selected.length === TEAM_SIZE &&
        unique.size === TEAM_SIZE &&
        total <= BUDGET;

    document.getElementById("submitButton").disabled = !valid;

}

function submitForm(event) {

    event.preventDefault();

    alert("Perfect! Next step we'll send this to Google Sheets.");

}

initForm();
