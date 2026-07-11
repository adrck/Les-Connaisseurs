(function () {
"use strict";

async function initHome() {

    const eyebrow = document.getElementById("hero-eyebrow");
    const actions = document.getElementById("hero-actions");
    const status = document.getElementById("hero-status");

    if (!actions) return;

    let entriesOpen = true;

    try {

        const response = await fetch("data/settings.json");

        if (response.ok) {
            const settings = await response.json();

            if (eyebrow && settings.competition) {
                eyebrow.textContent = settings.competition;
            }

            if (settings.entriesOpen === false) {
                entriesOpen = false;
            }
        }

    } catch (error) {
        console.error(error);
    }

    if (entriesOpen) {

        actions.innerHTML = `
            <a class="button" href="#" onclick="loadPage('enter')">Fichar mi equipo</a>
            <a class="button secondary" href="#" onclick="loadPage('standings')">Ver la general</a>
        `;

        status.textContent = "";

    } else {

        actions.innerHTML = `
            <a class="button" href="#" onclick="loadPage('standings')">Ver la clasificación</a>
            <a class="button secondary" href="#" onclick="loadPage('teams')">Ver equipos</a>
        `;

        status.textContent = "Los fichajes están cerrados por ahora.";

    }

}

initHome();

})();
