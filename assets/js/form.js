const TEAM_SIZE = 8;
const BUDGET = 120;

let riders = [];

async function loadRiders() {

    const response = await fetch("data/riders.json");

    riders = await response.json();

    createSelectors();

}

function createSelectors(){

    const container = document.getElementById("riderSelections");

    container.innerHTML="";

    for(let i=1;i<=TEAM_SIZE;i++){

        const label=document.createElement("label");

        label.textContent="Rider "+i;

        const select=document.createElement("select");

        select.className="riderSelect";

        select.innerHTML="<option value=''>Choose rider...</option>";

        riders.forEach(r=>{

            select.innerHTML+=`<option value="${r.name}">${r.name} (€${r.price})</option>`;

        });

        select.addEventListener("change",updateBudget);

        container.appendChild(label);

        container.appendChild(select);

    }

}

function updateBudget(){

    let total=0;

    document.querySelectorAll(".riderSelect").forEach(select=>{

        const rider=riders.find(r=>r.name===select.value);

        if(rider){

            total+=rider.price;

        }

    });

    document.getElementById("totalCost").textContent=total;

    document.getElementById("remainingBudget").textContent=BUDGET-total;

}

loadRiders();
