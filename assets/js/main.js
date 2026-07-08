async function loadPage(page) {

    try {

        const response = await fetch(`pages/${page}.html`);

        if (!response.ok) {
            throw new Error(`Could not load ${page}.html`);
        }

        const html = await response.text();

        document.getElementById("content").innerHTML = html;

        // Load page-specific scripts
        if (page === "enter") {

            // Remove previous copy if it exists
            const existing = document.getElementById("formScript");

            if (existing) {
                existing.remove();
            }

            const script = document.createElement("script");

            script.id = "formScript";

            script.src = "assets/js/form.js";

            document.body.appendChild(script);

        }

    }

    catch (error) {

        document.getElementById("content").innerHTML =
            `<div class="card">
                <h2>Error</h2>
                <p>${error.message}</p>
            </div>`;

        console.error(error);

    }

}

// Load the home page when the site opens
window.onload = function () {

    loadPage("home");

};
