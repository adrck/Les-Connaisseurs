async function loadPage(page) {

    const response = await fetch(`pages/${page}.html`);

    if (!response.ok) {
        document.getElementById("content").innerHTML =
            `<h2>Error</h2><p>Could not load ${page}.html</p>`;
        return;
    }

    const html = await response.text();

    document.getElementById("content").innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {

    loadPage("home");

    document.querySelectorAll("nav a").forEach(link => {

        link.addEventListener("click", e => {

            e.preventDefault();

            loadPage(link.dataset.page);

        });

    });

});
