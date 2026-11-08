/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

  // Every form on the site posts to the same FormSubmit form, so all
  // submissions land in one inbox: formsubmit.app/dashboard/forms/xvfwex8rvq
  var formEndpoint = "https://formsubmit.app/f/xvfwex8rvq";

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

  // Route any leftover link that points straight at the form endpoint back to
  // the on-site seller form, so nobody lands on a bare form service page.
  var sellerLinks = document.querySelectorAll(
    'a[href*="docs.google.com/forms"], a[href*="formsubmit.app/f/"]'
  );
  Array.prototype.forEach.call(sellerLinks, function (link) {
    var onSellPage = new RegExp("(?:^|/)sell[.]html$").test(window.location.pathname);
    link.href = onSellPage ? "#seller-form" : "sell.html#seller-form";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  // The seller form carries file inputs, so it must post as multipart. The
  // upload controls live in the markup; nothing is injected here.
  var sellerForm = document.getElementById("sellerForm");
  if (sellerForm) {
    sellerForm.action = formEndpoint;
    sellerForm.method = "POST";
    sellerForm.enctype = "multipart/form-data";
  }

  // FormSubmit accepts roughly 4.5 MB per request. Warn before the visitor
  // spends time on an upload that the endpoint will reject.
  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
  function totalUploadBytes(form) {
    var total = 0;
    var inputs = form.querySelectorAll('input[type="file"]');
    Array.prototype.forEach.call(inputs, function (input) {
      Array.prototype.forEach.call(input.files || [], function (file) {
        total += file.size;
      });
    });
    return total;
  }

  // Submit with fetch so the page can confirm FormSubmit actually accepted
  // the submission. Sending Accept: application/json makes FormSubmit reply
  // with JSON instead of redirecting to its thank-you page.
  var forms = document.querySelectorAll(
    'form[action*="formsubmit.co/"], form[action*="formsubmit.app/"]'
  );
  if (!forms.length) return;

  var successMessage =
    "Thank you — your message has been sent. We usually reply within one working day. " +
    "For anything urgent call or WhatsApp 0101 490 036.";
  var failureMessage =
    "Sorry — we couldn't send your message just now. Please try again, or call or " +
    "WhatsApp 0101 490 036.";

  Array.prototype.forEach.call(forms, function (form) {
    // Keep the endpoint in the markup identical to the live form.
    form.action = formEndpoint;

    // formsubmit.app calls the honeypot field _gotcha. The older pages carry a
    // _honey input, which this service would ignore, so rename it in place.
    Array.prototype.forEach.call(form.querySelectorAll('[name="_honey"]'), function (field) {
      field.name = "_gotcha";
    });

    // Timestamp the moment the form was rendered so the service's
    // time-to-submit spam check has something to compare against.
    var renderedAt = document.createElement("input");
    renderedAt.type = "hidden";
    renderedAt.name = "_ts";
    renderedAt.value = String(Date.now());
    form.appendChild(renderedAt);

    var status = form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var hasFileUpload = !!form.querySelector('input[type="file"]');

    function say(message, color) {
      if (!status) return;
      status.textContent = message;
      status.style.color = color;
      status.style.fontWeight = "600";
    }

    function setBusy(busy) {
      if (!button) return;
      button.disabled = busy;
      button.innerHTML = busy ? (hasFileUpload ? "Uploading…" : "Sending…") : original;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // Guard against a double click sending the same enquiry twice.
      if (form.getAttribute("data-sending") === "true") return;

      if (hasFileUpload && totalUploadBytes(form) > MAX_UPLOAD_BYTES) {
        say(
          "Those attachments are over 4 MB, which the form service cannot accept in one go. " +
            "Please send fewer or smaller files, or email them to s.lakhani1@aim.com.",
          "#b3261e"
        );
        return;
      }

      form.setAttribute("data-sending", "true");
      setBusy(true);
      say(
        hasFileUpload
          ? "Uploading your files and sending your submission…"
          : "Sending your message…",
        "#0a5f59"
      );

      // FormData carries every field as well as any selected files.
      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          var type = response.headers.get("content-type") || "";
          if (type.indexOf("json") === -1) {
            return { ok: false, error: { message: "unexpected response " + response.status } };
          }
          return response.json();
        })
        .then(function (result) {
          form.removeAttribute("data-sending");
          setBusy(false);
          if (result && result.ok) {
            form.reset();
            // Restart the timer so a second enquiry is not judged a bot.
            renderedAt.value = String(Date.now());
            say(successMessage, "#0a5f59");
            return;
          }
          var detail = result && result.error && result.error.message;
          say(detail ? failureMessage + " (" + detail + ")" : failureMessage, "#b3261e");
        })
        .catch(function () {
          // The request never completed (offline or blocked). Report it instead
          // of pretending the enquiry was delivered.
          form.removeAttribute("data-sending");
          setBusy(false);
          say(failureMessage, "#b3261e");
        });
    });
  });
})();
