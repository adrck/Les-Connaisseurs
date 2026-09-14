// Loaded once in index.html (not per-page, unlike form.js/teams.js/etc,
// which get swapped in and out by loadPage()) - this creates a single
// Supabase client for the whole session and keeps the small account
// status bar at the top of every page in sync with it. Depends on
// supabase-config.js (SUPABASE_URL/SUPABASE_ANON_KEY) and the Supabase
// JS CDN script both being loaded before this file - see index.html.

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function renderAccountBar(session) {

    const bar = document.getElementById("account-bar-status");
    if (!bar) return;

    if (session && session.user) {
        bar.innerHTML = `
            Ingelogd als <strong>${(session.user.email || "").replace(/"/g, "&quot;")}</strong>
            &nbsp;·&nbsp;
            <a href="#" id="account-bar-goto">Mijn account</a>
            &nbsp;·&nbsp;
            <a href="#" id="account-bar-logout">Uitloggen</a>
        `;

        const gotoLink = document.getElementById("account-bar-goto");
        if (gotoLink) {
            gotoLink.addEventListener("click", (event) => {
                event.preventDefault();
                loadPage("account");
            });
        }

        const logoutLink = document.getElementById("account-bar-logout");
        if (logoutLink) {
            logoutLink.addEventListener("click", async (event) => {
                event.preventDefault();
                await window.supabaseClient.auth.signOut();
                // onAuthStateChange below re-renders the bar; also send
                // people back to a sensible page rather than leaving them
                // on a now-gated "Mijn Team" page.
                loadPage("home");
            });
        }

    } else {
        bar.innerHTML = `
            Nog geen account?
            &nbsp;
            <a href="#" id="account-bar-login">Inloggen / aanmelden</a>
        `;

        const loginLink = document.getElementById("account-bar-login");
        if (loginLink) {
            loginLink.addEventListener("click", (event) => {
                event.preventDefault();
                loadPage("account");
            });
        }
    }

}

// Completes the "wachtwoord vergeten" flow started by account.js's
// handleForgotPassword(). Supabase emails a link back to this site; when
// clicked, the client-side SDK parses the recovery token from the URL
// during createClient() above and fires a one-time "PASSWORD_RECOVERY"
// auth event (handled below) - but by then a real session already
// exists, so without this, the person would just land on the normal
// site with no prompt to actually set a new password. This takes over
// #content directly (rather than going through loadPage()) so it works
// no matter which page the recovery link happens to land on, and works
// regardless of whether main.js's initial loadPage("home") has already
// run or not - see the window.__passwordRecoveryActive guard in
// main.js, which stops that initial home-page load from immediately
// overwriting this form if the recovery event fires first.
function renderPasswordRecoveryForm() {

    const content = document.getElementById("content");
    if (!content) return;

    content.innerHTML = `
        <h2>Nieuw wachtwoord instellen</h2>
        <div class="card">
            <p>Je klikte op een link om je wachtwoord opnieuw in te stellen. Vul hieronder je nieuwe wachtwoord in.</p>
            <form id="password-recovery-form">
                <div class="form-group">
                    <label for="recovery-password">Nieuw wachtwoord <span class="field-hint">(minimaal 6 tekens)</span></label>
                    <input type="password" id="recovery-password" name="password" required minlength="6" autocomplete="new-password">
                </div>
                <p id="recovery-message" class="form-message"></p>
                <button type="submit" id="recovery-btn">Wachtwoord instellen</button>
            </form>
        </div>
    `;

    document.body.className = "page-account";

    document
        .getElementById("password-recovery-form")
        .addEventListener("submit", handlePasswordRecoverySubmit);

}

async function handlePasswordRecoverySubmit(event) {

    event.preventDefault();

    const password = document.getElementById("recovery-password").value;
    const messageEl = document.getElementById("recovery-message");
    const btn = document.getElementById("recovery-btn");

    btn.disabled = true;
    messageEl.style.color = "#555";
    messageEl.style.fontWeight = "normal";
    messageEl.textContent = "Bezig...";

    const { error } = await window.supabaseClient.auth.updateUser({ password });

    btn.disabled = false;

    if (error) {
        messageEl.style.color = "#c62828";
        messageEl.style.fontWeight = "bold";
        messageEl.textContent = error.message;
        return;
    }

    window.__passwordRecoveryActive = false;

    const content = document.getElementById("content");
    content.innerHTML = `
        <h2>Nieuw wachtwoord instellen</h2>
        <div class="card">
            <p style="color:#2e7d32; font-weight:bold;">Je wachtwoord is bijgewerkt. Je bent nu ingelogd.</p>
            <p><a href="#" id="recovery-goto-home">Ga naar de site &rarr;</a></p>
        </div>
    `;

    document.getElementById("recovery-goto-home").addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        loadPage("home");
    });

}

window.supabaseClient.auth.getSession().then(({ data }) => {
    renderAccountBar(data.session);
});

window.supabaseClient.auth.onAuthStateChange((event, session) => {
    renderAccountBar(session);
    if (event === "PASSWORD_RECOVERY") {
        // Set before rendering so main.js's window.onload (which may
        // not have fired yet) knows not to blow this form away with the
        // normal loadPage("home").
        window.__passwordRecoveryActive = true;
        renderPasswordRecoveryForm();
    }
});
