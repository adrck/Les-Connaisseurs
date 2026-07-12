(function () {
"use strict";

const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbw389djdf27sw6uPJaIzZROgydiK5lC9kf2tBJYdrIPN7ujDna-9IZppaheXWshRefa/exec";

function initContact() {

    const form = document.getElementById("contact-form");

    if (!form) return;

    form.addEventListener("submit", submitContact);

}

async function submitContact(event) {

    event.preventDefault();

    const submission = {
        action: "contact",
        name: document.getElementById("contact-name").value.trim(),
        email: document.getElementById("contact-email").value.trim(),
        message: document.getElementById("contact-message").value.trim()
    };

    const submitButton = document.getElementById("contact-submit-btn");
    const statusMessage = document.getElementById("contact-message-status");

    if (submission.message === "") {
        statusMessage.style.color = "#c62828";
        statusMessage.textContent = "Please enter a message before sending.";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    statusMessage.textContent = "";

    try {

        const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(submission)
        });

        const result = await response.json();

        if (result.success) {

            statusMessage.style.color = "#2e7d32";
            statusMessage.textContent = "Thanks — your message has been sent!";
            document.getElementById("contact-form").reset();

        } else {

            statusMessage.style.color = "#c62828";
            statusMessage.textContent = result.error || "Something went wrong. Please try again.";

        }

    } catch (error) {

        console.error(error);
        statusMessage.style.color = "#c62828";
        statusMessage.textContent = "Unable to send your message. Please try again.";

    }

    submitButton.disabled = false;
    submitButton.textContent = "Send";

}

initContact();

})();
