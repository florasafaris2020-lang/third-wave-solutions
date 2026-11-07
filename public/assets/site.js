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

  // Route old/external seller-form buttons to the on-site seller form.
  var sellerLinks = document.querySelectorAll(
    'a[href*="docs.google.com/forms"], a[href*="formsubmit.app/f/"]'
  );
  Array.prototype.forEach.call(sellerLinks, function (link) {
    var onSellPage = new RegExp("(?:^|/)sell[.]html$").test(window.location.pathname);
    link.href = onSellPage ? "#seller-form-short" : "sell.html#seller-form-short";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  // Configure the seller form for file uploads. Keep the upload control in the
  // form itself; the FormSubmit endpoint receives the multipart POST directly.
  var sellerForm = document.getElementById("sellerForm");
  if (sellerForm) {
    sellerForm.action = formEndpoint;
    sellerForm.method = "POST";
    sellerForm.enctype = "multipart/form-data";

    var uploadField = document.createElement("div");
    uploadField.className = "field";
    uploadField.innerHTML =
      '<label for="seller-files">Business photos or supporting documents (optional)</label>' +
      '<input id="seller-files" name="Business files" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple>' +
      '<p class="small muted">Attach relevant photos or PDFs. Keep the total upload under 4 MB per submission; do not attach bank statements or ID copies.</p>';
    var submitButton = sellerForm.querySelector('button[type="submit"]');
    if (submitButton) sellerForm.insertBefore(uploadField, submitButton);

    // Avoid displaying the page's legacy success message before FormSubmit
    // has actually accepted the multipart submission.
    var legacySuccess = document.getElementById("formSuccess");
    if (legacySuccess) legacySuccess.remove();
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
