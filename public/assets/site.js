/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Form delivery — FormSubmit (formsubmit.app, form dj2hrduj7x)
  //
  // Every form on the site posts here: buyer enquiries, listing enquiries,
  // vetting quote requests and the seller's business upload. Submissions are
  // stored in the formsubmit.app dashboard and emailed to the form's
  // notification address; admin.html then turns an approved submission into a
  // published listing. Docs: https://formsubmit.app/docs
  //
  // One path for every form: fetch + FormData. The endpoint accepts multipart
  // submissions (files included) and answers with JSON, so the visitor stays
  // on the page and we know whether the submission was really stored.
  // ---------------------------------------------------------------------
  var FORM_ENDPOINT = "https://formsubmit.app/f/dj2hrduj7x";

  // The endpoint accepts request bodies up to about 4.5 MB, so stop short of
  // that instead of failing after a long upload.
  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  // Sent as `_ts`: FormSubmit's time-to-submit spam check.
  var renderedAt = String(Date.now());

  // Mobile navigation
  var toggle = document.getElementById("menuToggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Footer year
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // A link straight at a form endpoint would dump the visitor on the form
  // service's own page; send them to our seller form instead.
  var sellerLinks = document.querySelectorAll(
    'a[href*="docs.google.com/forms"], a[href*="formsubmit.app/f/"]'
  );
  Array.prototype.forEach.call(sellerLinks, function (link) {
    var onSellPage = /(?:^|\/)sell[.]html$/.test(window.location.pathname);
    link.href = onSellPage ? "#seller-form" : "sell.html#seller-form";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  var successMessage =
    "Thank you — your message has been sent. We usually reply within one working day. " +
    "For anything urgent call or WhatsApp 0101 490 036.";
  var failureMessage =
    "Sorry — we couldn't send your message just now. Please try again, or call or " +
    "WhatsApp 0101 490 036.";

  function statusFor(form) {
    return form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
  }

  function say(node, message, colour) {
    if (!node) return;
    node.textContent = message;
    node.style.color = colour;
    node.style.fontWeight = "600";
  }

  function totalUploadBytes(form) {
    var total = 0;
    Array.prototype.forEach.call(form.querySelectorAll('input[type="file"]'), function (input) {
      Array.prototype.forEach.call(input.files || [], function (file) {
        total += file.size;
      });
    });
    return total;
  }

  // FormSubmit answers {ok: true, message} or {ok: false, error: {code, message}}.
  function describeFailure(result) {
    var error = (result && result.error) || {};
    var code = error.code;
    if (code === "rate_limited") {
      return "That was several messages in a row. Please wait a minute and send again, or call 0101 490 036.";
    }
    if (code === "payload_too_large") {
      return "The attachments were too large to send in one go. Please send fewer or smaller files, or email s.lakhani1@aim.com.";
    }
    if (code === "storage_quota_exceeded") {
      return "The form has run out of file storage. Please email your documents to s.lakhani1@aim.com instead.";
    }
    if (code === "form_inactive" || code === "form_not_found") {
      return "The form is not accepting submissions at the moment. Please call or WhatsApp 0101 490 036.";
    }
    return failureMessage + (error.message ? " (" + error.message + ")" : "");
  }

  var forms = document.querySelectorAll('form[action*="formsubmit"]');
  Array.prototype.forEach.call(forms, function (form) {
    var status = statusFor(form);
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var hasFiles = !!form.querySelector('input[type="file"]');

    // FormSubmit's honeypot field is `_gotcha`; the pages ship a `_honey` input.
    Array.prototype.forEach.call(form.querySelectorAll('[name="_honey"], [name="_gotcha"]'), function (input) {
      input.name = "_gotcha";
      input.value = "";
      input.setAttribute("tabindex", "-1");
      input.setAttribute("autocomplete", "off");
    });

    form.action = FORM_ENDPOINT;
    form.method = "POST";
    form.enctype = "multipart/form-data";

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // A double click must not send the same submission twice.
      if (form.getAttribute("data-sending") === "true") return;

      var bytes = totalUploadBytes(form);
      if (bytes > MAX_UPLOAD_BYTES) {
        say(
          status,
          "Those attachments are over 4 MB, which the form cannot accept in one request. " +
            "Please send fewer or smaller files, or email them to s.lakhani1@aim.com.",
          "#b3261e"
        );
        return;
      }

      var data = new FormData(form);
      data.set("_ts", renderedAt);
      var emailField = form.querySelector('input[type="email"]');
      if (emailField && emailField.value) data.set("_replyto", emailField.value);

      form.setAttribute("data-sending", "true");
      if (button) {
        button.disabled = true;
        button.innerHTML = hasFiles ? "Uploading…" : "Sending…";
      }
      say(status, hasFiles ? "Uploading your files…" : "Sending your message…", "#0a5f59");

      fetch(FORM_ENDPOINT, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          return response.json().catch(function () {
            return null;
          });
        })
        .then(function (result) {
          form.removeAttribute("data-sending");
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
          if (result && result.ok) {
            form.reset();
            say(status, successMessage, "#0a5f59");
            return;
          }
          say(status, describeFailure(result), "#b3261e");
        })
        .catch(function () {
          // The request never completed (offline, blocked, or a browser
          // extension). Say so rather than pretending it was delivered.
          form.removeAttribute("data-sending");
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
          say(status, failureMessage, "#b3261e");
        });
    });
  });
})();
