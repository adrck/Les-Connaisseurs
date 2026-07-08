async function loadPage(page) {

    const response = await fetch(`pages/${page}.html`);

    const html = await response.text();

    document.getElementById("content").innerHTML = html;

}

window.onload = function () {

    loadPage("home");

};
