// Loaded once in index.html (not per-page, unlike form.js/teams.js/etc,
// which get swapped in and out by loadPage()) - this creates a single
// Supabase client for the whole session and keeps the small account
// status bar at the top of every page in sync with it. Depends on
// supabase-config.js (SUPABASE_URL/SUPABASE_ANON_KEY) and the Supabase
// JS CDN script both being loaded before this file - see index.html.

// Captured BEFORE createClient() runs, not just before any other of our
// own code - confirmed via a live diagnostic that createClient() itself
// (its internal detectSessionInUrl handling) can strip type=signup out of
// the hash synchronously, before the very next line of this script even
// runs. Password recovery's equivalent check further down (still placed
// after createClient()) gets away with checking the URL live because it
// has a second path - the "PASSWORD_RECOVERY" auth event still fires as a
// fallback even once the hash is gone. Signup confirmation has no such
// event to fall back on (supabase-js only fires a generic "SIGNED_IN"),
// so capturing this as a plain boolean up here, before createClient() has
// any chance to touch the URL, is the only reliable way to catch it.
const isSignupConfirmationRedirect =
    /type=signup/.test(window.location.hash) || /type=signup/.test(window.location.search);

// TEMPORARY CHECKPOINT DIAGNOSTIC - the previous fix (capturing this
// boolean before createClient()) is confirmed deployed and correct, but
// the confirmation message still isn't showing. Rather than guess again,
// this logs a marker at each step of the actual execution path so we can
// see exactly how far it gets. Remove once resolved. Check afterward via
// DevTools, any tab on the site:
//     localStorage.getItem('__diag_step1_captured')
//     localStorage.getItem('__diag_step2_ifentered')
//     localStorage.getItem('__diag_step3_renderstart')
//     localStorage.getItem('__diag_step4_contentfound')
//     localStorage.getItem('__diag_step5_onload_flag')
window.localStorage.setItem("__diag_step1_captured", String(isSignupConfirmationRedirect));

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Detects a password-recovery redirect directly from the URL, rather than
// relying solely on supabase-js's own "PASSWORD_RECOVERY" auth event.
// That event has a well-documented history of being unreliable - in
// practice it sometimes never fires at all, with only a plain
// "SIGNED_IN" firing instead (see supabase/gotrue-js#349 and
// supabase#3360 upstream), which is exactly what would otherwise happen
// here: the person lands on the site already logged in, with no prompt
// to set a new password. Checking the URL directly, synchronously, right
// here - before anything else runs - sidesteps that unreliability
// entirely, and also wins the race against the SDK's own known behavior
// of sometimes clearing the URL hash before its event fires. NOTE: unlike
// the signup check above, this one is intentionally left checking the URL
// live (after createClient()) rather than refactored to the pre-capture
// pattern - it's already confirmed working end-to-end in production via
// its PASSWORD_RECOVERY event fallback, so it's left exactly as tested
// rather than restructured without a concrete reason to touch it.
function isPasswordRecoveryRedirect() {
    return /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
}

if (isPasswordRecoveryRedirect()) {
    // Set immediately, synchronously - main.js's window.onload (which may
    // run before or after this, depending on load timing) checks this
    // flag before doing its normal loadPage("home").
    window.__passwordRecoveryActive = true;
    // Render immediately too, rather than waiting for the (unreliable)
    // PASSWORD_RECOVERY event - renderPasswordRecoveryForm is defined
    // further down this same file, but function declarations are
    // hoisted, so calling it here works fine. The onAuthStateChange
    // handler below still also calls it on a real PASSWORD_RECOVERY
    // event, as a redundant fallback - calling this twice is harmless,
    // it just re-renders the same form.
    renderPasswordRecoveryForm();
}

// Same idea as isPasswordRecoveryRedirect() above, for the OTHER email
// link Supabase sends: the signup confirmation link. Without this, a
// freshly confirmed participant just lands on whatever page the hash
// falls through to (usually home, since the auth hash fragment isn't a
// real page name - see main.js's pageFromHash()) with no acknowledgment
// beyond the small "Ingelogd als..." line in the account bar - easy to
// miss, no clear "yes, that worked" moment. CONFIRMED against a real
// confirmation email from this project's Supabase setup (2026-09-14):
// the redirect hash does carry "...&token_type=bearer&type=signup" -
// the earlier assumption was correct in shape, the bug was purely in
// checking too late (see isSignupConfirmationRedirect above, captured
// before createClient() for exactly this reason).
if (isSignupConfirmationRedirect) {
    // Set immediately, synchronously - main.js's window.onload checks
    // this before doing its normal loadPage("home").
    window.__signupConfirmationActive = true;
    window.localStorage.setItem("__diag_step2_ifentered", "true, flag set to " + window.__signupConfirmationActive);
    // renderSignupConfirmation is defined further down this file; hoisted,
    // same as renderPasswordRecoveryForm above.
    renderSignupConfirmation();
}

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

// Completes the signup-confirmation flow: shows an explicit "yes, that
// worked" message instead of silently dropping the person on the
// homepage already logged in. Takes over #content directly (rather than
// going through loadPage()), same reasoning as renderPasswordRecoveryForm
// above - works no matter which page the confirmation link happens to
// land on, and regardless of whether main.js's initial loadPage("home")
// has already run (see the window.__signupConfirmationActive guard in
// main.js).
function renderSignupConfirmation() {

    window.localStorage.setItem("__diag_step3_renderstart", "true");

    const content = document.getElementById("content");
    window.localStorage.setItem("__diag_step4_contentfound", content ? "found" : "NULL - element missing");
    if (!content) return;

    content.innerHTML = `
        <h2>Mijn account</h2>
        <div class="card">
            <p style="color:#2e7d32; font-weight:bold;">Je e-mailadres is bevestigd — je bent nu ingelogd!</p>
            <p>Ga je team samenstellen, of bekijk eerst je accountgegevens.</p>
            <p><a href="#" id="signup-confirm-goto-team">Ga naar Mijn Team &rarr;</a></p>
            <p><a href="#" id="signup-confirm-goto-account">Ga naar Mijn account &rarr;</a></p>
        </div>
    `;

    document.body.className = "page-account";

    // Either link clears the flag and hands off to a normal loadPage()
    // navigation - from this point on the app behaves exactly as if the
    // person had just clicked "Mijn account" or "Mijn Team" from the nav.
    document.getElementById("signup-confirm-goto-team").addEventListener("click", (event) => {
        event.preventDefault();
        window.__signupConfirmationActive = false;
        loadPage("enter");
    });

    document.getElementById("signup-confirm-goto-account").addEventListener("click", (event) => {
        event.preventDefault();
        window.__signupConfirmationActive = false;
        loadPage("account");
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
