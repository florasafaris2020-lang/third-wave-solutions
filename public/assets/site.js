/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Form delivery — FormSubmit (formsubmit.co address endpoint)
  //
  // Delivery goes to the address below. There is no form id and no
  // dashboard for this service: the first real submission emails the owner
  // a one-click "Activate Form" link, and nothing is delivered until that
  // link is clicked. To move to a dashboard-backed form later, change the
  // two endpoints here (and the action attributes) to the new endpoint.
  //
  //   text-only forms  -> /ajax/ endpoint: JSON reply, visitor stays put
  //   forms with files -> ordinary multipart POST plus a `_next` page,
  //                       because attachments survive only on that path
  // ---------------------------------------------------------------------
  var FORM_ADDRESS = "sleek12@gmail.com";
  var AJAX_ENDPOINT = "https://formsubmit.co/ajax/" + FORM_ADDRESS;
  var PAGE_ENDPOINT = "https://formsubmit.co/" + FORM_ADDRESS;
  var THANKS_URL = new URL("thanks.html", window.location.href).href;

  // FormSubmit accepts up to 10 MB in total per submission; we stop well
  // short of that so a slow connection is not wasted on a doomed upload.
  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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

  // Route any leftover link that points straight at a form endpoint back to
  // the on-site seller form, so nobody lands on a bare form service page.
  var sellerLinks = document.querySelectorAll(
    'a[href*="docs.google.com/forms"], a[href*="formsubmit.app/f/"], a[href*="formsubmit.co/ajax/"]'
  );
  Array.prototype.forEach.call(sellerLinks, function (link) {
    var onSellPage = new RegExp("(?:^|/)sell[.]html$").test(window.location.pathname);
    link.href = onSellPage ? "#seller-form" : "sell.html#seller-form";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

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
    var inputs = form.querySelectorAll('input[type="file"]');
    Array.prototype.forEach.call(inputs, function (input) {
      Array.prototype.forEach.call(input.files || [], function (file) {
        total += file.size;
      });
    });
    return total;
  }

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
    var status = statusFor(form);
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var hasFileUpload = !!form.querySelector('input[type="file"]');

    function setBusy(busy, label) {
      if (!button) return;
      button.disabled = busy;
      button.innerHTML = busy ? label : original;
    }

    if (hasFileUpload) {
      // Let the browser post natively so the attachments travel with the
      // request; FormSubmit then forwards the visitor to the thanks page.
      var nextField = form.querySelector('[name="_next"]');
      if (!nextField) {
        nextField = document.createElement("input");
        nextField.type = "hidden";
        nextField.name = "_next";
        form.appendChild(nextField);
      }
      nextField.value = THANKS_URL;
      form.action = PAGE_ENDPOINT;
      form.method = "POST";
      form.enctype = "multipart/form-data";

      form.addEventListener("submit", function (event) {
        var bytes = totalUploadBytes(form);
        if (bytes > MAX_UPLOAD_BYTES) {
          event.preventDefault();
          say(
            status,
            "Those attachments are over 4 MB, which the form service cannot accept in one go. " +
              "Please send fewer or smaller files, or email them to s.lakhani1@aim.com.",
            "#b3261e"
          );
          return;
        }
        say(
          status,
          "Uploading your files — you will be taken to a confirmation page when the upload finishes…",
          "#0a5f59"
        );
        setBusy(true, "Uploading…");
      });
      return;
    }

    // Text-only form: submit with fetch so the page can confirm the service
    // actually accepted it, and keep the visitor on the page.
    form.action = AJAX_ENDPOINT;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // Guard against a double click sending the same enquiry twice.
      if (form.getAttribute("data-sending") === "true") return;
      form.setAttribute("data-sending", "true");
      setBusy(true, "Sending…");
      say(status, "Sending your message…", "#0a5f59");

      fetch(AJAX_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams(new FormData(form)),
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          var type = response.headers.get("content-type") || "";
          if (type.indexOf("json") === -1) {
            return { success: "false", message: "unexpected response " + response.status };
          }
          return response.json();
        })
        .then(function (result) {
          form.removeAttribute("data-sending");
          setBusy(false);
          // FormSubmit answers {success: "true" | "false", message: "…"} —
          // note the strings, so "false" is truthy and must be compared.
          if (result && String(result.success) === "true") {
            form.reset();
            say(status, successMessage, "#0a5f59");
            return;
          }
          var detail = result && result.message;
          say(detail ? failureMessage + " (" + detail + ")" : failureMessage, "#b3261e");
        })
        .catch(function () {
          // The request never completed (offline or blocked). Report it rather
          // than pretending the enquiry was delivered.
          form.removeAttribute("data-sending");
          setBusy(false);
          say(status, failureMessage, "#b3261e");
        });
    });
  });
})();
