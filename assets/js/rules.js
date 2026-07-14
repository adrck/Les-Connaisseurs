async function initRules() {

    const nameEl = document.getElementById("rules-competition-name");
    const teamSizeEl = document.getElementById("rules-team-size");

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

        // Switch jersey colors on this page to match whichever Grand Tour
        // is currently in play (gdi / tdf / lav). See the "Jersey colors"
        // rules in style.css for how gt-* classes map to colors.
        document.body.classList.remove("gt-gdi", "gt-tdf", "gt-lav");

        const gtClass = {
            gdi: "gt-gdi",
            tdf: "gt-tdf",
            lav: "gt-lav"
        }[settings.whichGt];

        if (gtClass) {
            document.body.classList.add(gtClass);
        }

    } catch (error) {
        console.error(error);
    }

}

initRules();
