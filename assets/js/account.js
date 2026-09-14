(function () {
"use strict";

async function initAccount() {

    const loadingEl = document.getElementById("account-loading");
    const loggedOutEl = document.getElementById("account-logged-out");
    const loggedInEl = document.getElementById("account-logged-in");

    if (!loadingEl) return; // not on the account page

    const signupForm = document.getElementById("signup-form");
    const loginForm = document.getElementById("login-form");
    const forgotLink = document.getElementById("forgot-password-link");
    const claimForm = document.getElementById("claim-form");
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");

    signupForm.addEventListener("submit", handleSignup);
    loginForm.addEventListener("submit", handleLogin);
    forgotLink.addEventListener("click", handleForgotPassword);
    claimForm.addEventListener("submit", handleClaim);
    tabLogin.addEventListener("click", () => switchAccountTab("login"));
    tabSignup.addEventListener("click", () => switchAccountTab("signup"));

    await render();

    // If the user logs in/out from elsewhere (e.g. the account bar) while
    // this page happens to be open, keep it in sync.
    window.supabaseClient.auth.onAuthStateChange(() => {
        render();
    });

}

// Switches between the "Inloggen" and "Aanmelden" tabs on the logged-out
// view - both forms stay in the DOM the whole time (only their panel's
// display toggles), so nothing here needs to touch form state, and any
// message already showing in one panel is preserved if the person
// switches away and back.
function switchAccountTab(tab) {

    const isLogin = tab === "login";

    document.getElementById("panel-login").style.display = isLogin ? "" : "none";
    document.getElementById("panel-signup").style.display = isLogin ? "none" : "";

    document.getElementById("tab-login").classList.toggle("account-tab--active", isLogin);
    document.getElementById("tab-login").setAttribute("aria-selected", isLogin ? "true" : "false");

    document.getElementById("tab-signup").classList.toggle("account-tab--active", !isLogin);
    document.getElementById("tab-signup").setAttribute("aria-selected", isLogin ? "false" : "true");

}

async function render() {

    const loadingEl = document.getElementById("account-loading");
    const loggedOutEl = document.getElementById("account-logged-out");
    const loggedInEl = document.getElementById("account-logged-in");

    if (!loadingEl) return; // page was navigated away from mid-request

    loadingEl.style.display = "";
    loggedOutEl.style.display = "none";
    loggedInEl.style.display = "none";

    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (!loadingEl.isConnected) return; // navigated away while awaiting

    if (!session) {
        loadingEl.style.display = "none";
        loggedOutEl.style.display = "";
        return;
    }

    document.getElementById("account-email-line").textContent =
        `Ingelogd als ${session.user.email}`;

    const { data: team, error } = await window.supabaseClient
        .from("teams")
        .select("id, player_name, claimed")
        .eq("user_id", session.user.id)
        .maybeSingle();

    if (!loadingEl.isConnected) return;

    loadingEl.style.display = "none";
    loggedInEl.style.display = "";

    const hasTeamEl = document.getElementById("account-has-team");
    const noTeamEl = document.getElementById("account-no-team");

    if (error) {
        console.error(error);
        hasTeamEl.style.display = "none";
        noTeamEl.style.display = "none";
        return;
    }

    if (team) {
        hasTeamEl.style.display = "";
        noTeamEl.style.display = "none";
        document.getElementById("account-team-line").textContent =
            `Jouw team: ${team.player_name}`;
        document.getElementById("account-team-line").style.color = "#2e7d32";
        document.getElementById("account-team-line").style.fontWeight = "bold";
        document.getElementById("account-goto-team").addEventListener("click", (event) => {
            event.preventDefault();
            loadPage("enter");
        });
    } else {
        hasTeamEl.style.display = "none";
        noTeamEl.style.display = "";
        document.getElementById("account-goto-team-new").addEventListener("click", (event) => {
            event.preventDefault();
            loadPage("enter");
        });
    }

}

async function handleSignup(event) {

    event.preventDefault();

    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const messageEl = document.getElementById("signup-message");
    const btn = document.getElementById("signup-btn");

    btn.disabled = true;
    messageEl.style.color = "#555";
    messageEl.style.fontWeight = "normal";
    messageEl.textContent = "Bezig...";

    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });

    btn.disabled = false;

    if (error) {
        messageEl.style.color = "#c62828";
        messageEl.style.fontWeight = "bold";
        messageEl.textContent = error.message;
        return;
    }

    if (!data.session) {
        // Email confirmation is turned on for this project - no session
        // until the participant clicks the link in their inbox.
        messageEl.style.color = "#2e7d32";
        messageEl.style.fontWeight = "bold";
        messageEl.textContent = "Bijna klaar - check je e-mail om je account te bevestigen.";
        return;
    }

    messageEl.textContent = "";
    await render();

}

async function handleLogin(event) {

    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const messageEl = document.getElementById("login-message");
    const btn = document.getElementById("login-btn");

    btn.disabled = true;
    messageEl.style.color = "#555";
    messageEl.style.fontWeight = "normal";
    messageEl.textContent = "Bezig...";

    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    btn.disabled = false;

    if (error) {
        messageEl.style.color = "#c62828";
        messageEl.style.fontWeight = "bold";
        messageEl.textContent = "Inloggen mislukt - controleer je e-mailadres en wachtwoord.";
        return;
    }

    messageEl.textContent = "";
    await render();

}

async function handleForgotPassword(event) {

    event.preventDefault();

    const email = document.getElementById("login-email").value.trim() ||
        document.getElementById("signup-email").value.trim();
    const messageEl = document.getElementById("forgot-password-message");

    if (!email) {
        messageEl.style.color = "#c62828";
        messageEl.textContent = "Vul eerst je e-mailadres in bij een van de velden hierboven.";
        return;
    }

    messageEl.style.color = "#555";
    messageEl.textContent = "Bezig...";

    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email);

    if (error) {
        messageEl.style.color = "#c62828";
        messageEl.textContent = error.message;
        return;
    }

    messageEl.style.color = "#2e7d32";
    messageEl.style.fontWeight = "bold";
    messageEl.textContent = "Check je e-mail voor een link om je wachtwoord opnieuw in te stellen.";

}

async function handleClaim(event) {

    event.preventDefault();

    const playerName = document.getElementById("claim-player-name").value.trim();
    const pin = document.getElementById("claim-pin").value.trim();
    const messageEl = document.getElementById("claim-message");
    const btn = document.getElementById("claim-btn");

    btn.disabled = true;
    messageEl.style.color = "#555";
    messageEl.style.fontWeight = "normal";
    messageEl.textContent = "Bezig...";

    const { data, error } = await window.supabaseClient.rpc("claim_team", {
        p_player_name: playerName,
        p_pin: pin
    });

    btn.disabled = false;

    if (error) {
        messageEl.style.color = "#c62828";
        messageEl.style.fontWeight = "bold";
        messageEl.textContent = "Geen team gevonden met deze teamnaam + PIN. Controleer de invoer.";
        console.error(error);
        return;
    }

    messageEl.textContent = "";
    await render();

}

window.requestAnimationFrame(() => {
    initAccount();
});

})();
