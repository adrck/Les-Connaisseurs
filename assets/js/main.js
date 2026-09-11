// Which page names are legal - fetched as pages/<name>.html and mapped
// to a hash like #teams. Keeps loadPage() and the hash-routing below
// from ever trying to fetch/pushState an arbitrary/typo'd page name -
// anything not in this list quietly falls back to "home".
const VALID_PAGES = ["home", "rules", "enter", "standings", "teams", "riders", "account", "contact"];

// Tracks what's currently showing so the popstate/hashchange listeners
// below can tell "the URL changed because of something loadPage() just
// did" apart from "the URL changed because the user hit back/forward or
// edited the hash directly" - only the latter should trigger a reload.
let currentPage = null;

async function loadPage(page, options = {}) {

    const { pushHistory = true } = options;

    if (!VALID_PAGES.includes(page)) {
        page = "home";
    }

    currentPage = page;

    try {

        const response = await fetch(`pages/${page}.html`);

        if (!response.ok) {
            throw new Error(`Could not load ${page}.html`);
        }

        const html = await response.text();

        document.getElementById("content").innerHTML = html;

        document.body.className = "page-" + page;

        // Gives every page a real, bookmarkable/shareable URL (e.g.
        // #teams) and makes browser back/forward work between them,
        // without needing any server-side routing config - hash
        // fragments never leave the browser, so this is safe on GitHub
        // Pages as-is. "home" is treated as the implicit root: clicking
        // Home clears the hash back to a plain URL instead of leaving
        // "#home" in the address bar, matching how a fresh visit with no
        // hash already lands on Home below.
        if (pushHistory) {
            const target = page === "home"
                ? location.pathname + location.search
                : "#" + page;
            if ((location.hash || "") !== (page === "home" ? "" : "#" + page)) {
                history.pushState({ page }, "", target);
            }
        }

        // Auto pageview counting is disabled on the script tag (this is a
        // single-page app - no real page reloads), so report each
        // navigation manually instead. Guarded in case GoatCounter's script
        // is blocked (ad blocker) or hasn't finished loading yet.
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({
                path: page,
                title: document.title
            });
        }

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
    account: "assets/js/account.js",
    rules: "assets/js/rules.js",
    contact: "assets/js/contact.js"
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

// Reads the current #hash and returns a known page name, defaulting to
// "home" for an empty hash (a plain visit with no fragment) or anything
// unrecognized (a stale/bad link).
function pageFromHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    return VALID_PAGES.includes(raw) ? raw : "home";
}

// Handles the user navigating via the browser's own back/forward buttons,
// or editing/opening a URL with a different #hash while the app is
// already running (pushState-driven navigation, i.e. clicking a nav link,
// never fires either of these events, so there's no risk of loadPage()
// re-running twice for the same click).
function handleHashNavigation() {
    const target = pageFromHash();
    if (target !== currentPage) {
        loadPage(target, { pushHistory: false });
    }
}

window.addEventListener("popstate", handleHashNavigation);
window.addEventListener("hashchange", handleHashNavigation);

// Load the page the URL points at when the site opens - the shared hash
// route if one's present (so a bookmarked/shared #teams link lands
// directly on Teams), Home otherwise. Skipped entirely if a password-
// reset link just landed us here with a recovery form already showing
// (see supabase-client.js's PASSWORD_RECOVERY handling) - without this
// guard, this would immediately overwrite that form with whatever page
// the hash happens to point at.
window.onload = function () {

    if (window.__passwordRecoveryActive) return;

    loadPage(pageFromHash(), { pushHistory: false });

};

function toggleMobileMenu() {

    document.getElementById("mobile-menu").classList.toggle("open");
    document.querySelector(".mobile-menu-toggle").classList.toggle("open");

}

function closeMobileMenu() {

    document.getElementById("mobile-menu").classList.remove("open");
    document.querySelector(".mobile-menu-toggle").classList.remove("open");

}
