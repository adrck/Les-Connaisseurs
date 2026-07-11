async function loadPage(page) {

    try {

        const response = await fetch(`pages/${page}.html`);

        if (!response.ok) {
            throw new Error(`Could not load ${page}.html`);
        }

        const html = await response.text();

        document.getElementById("content").innerHTML = html;

        document.body.className = "page-" + page;

       // Remove any previous page script
const existing = document.getElementById("pageScript");

if (existing) {
    existing.remove();
}

let script = null;

const pageScripts = {
    enter: "assets/js/form.js",
    standings: "assets/js/standings.js",
    riders: "assets/js/riders.js",
    teams: "assets/js/teams.js",
    rules: "assets/js/rules.js"
};

if (pageScripts[page]) {
    script = document.createElement("script");
    script.src = pageScripts[page];
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
