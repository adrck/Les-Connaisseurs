async function initRules() {

    const nameEl = document.getElementById("rules-competition-name");
    const teamSizeEl = document.getElementById("rules-team-size");

    if (!nameEl && !teamSizeEl) return;

    try {

        const response = await fetch("data/settings.json");

        if (!response.ok) {
            throw new Error("Unable to load settings.json");
        }

        const settings = await response.json();

        if (nameEl && settings.competition) {
            nameEl.textContent = settings.competition;
        }

        if (teamSizeEl && settings.teamSize) {
            teamSizeEl.textContent = settings.teamSize;
        }

    } catch (error) {
        console.error(error);
    }

}

initRules();
