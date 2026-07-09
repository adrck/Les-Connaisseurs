async function loadPage(page) {

    try {

        const response = await fetch(`pages/${page}.html`);

        if (!response.ok) {
            throw new Error(`Could not load ${page}.html`);
        }

        const html = await response.text();

        document.getElementById("content").innerHTML = html;

       // Remove any previous page script
const existing = document.getElementById("pageScript");

if (existing) {
    existing.remove();
}

let script = null;

if (page === "enter") {

    script = document.createElement("script");
    script.src = "assets/js/form.js";

}

if (page === "standings") {

    script = document.createElement("script");
    script.src = "assets/js/standings.js";

}

if (script) {
    script.id = "pageScript";
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
