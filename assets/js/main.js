// Load a page into the main content area
async function loadPage(page) {

    try {

        const response = await fetch(`pages/${page}.html`);

        if (!response.ok) {
            throw new Error(`Could not load ${page}.html`);
        }

        const html = await response.text();

        document.getElementById("content").innerHTML = html;

        // Run page-specific code
        switch (page) {

            case "enter":
                await loadScript("assets/js/form.js");
                break;

            case "standings":
                // We'll add standings.js later
                break;

            case "riders":
                // We'll add riders.js later
                break;

            case "teams":
                // We'll add teams.js later
                break;
        }

    } catch (error) {

        document.getElementById("content").innerHTML = `
            <div class="card">
                <h2>Error</h2>
                <p>${error.message}</p>
            </div>
        `;

        console.error(error);

    }

}

// Dynamically load a JavaScript file
function loadScript(src) {

    return new Promise((resolve, reject) => {

        // Remove any previous copy of the script
        const existing = document.querySelector(`script[src="${src}"]`);

        if (existing) {
            existing.remove();
        }

        const script = document.createElement("script");

        script.src = src;

        script.onload = resolve;

        script.onerror = reject;

        document.body.appendChild(script);

    });

}

// Navigation
document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("nav a").forEach(link => {

        link.addEventListener("click", function (e) {

            e.preventDefault();

            loadPage(this.dataset.page);

        });

    });

    // Load the home page by default
    loadPage("home");

});
