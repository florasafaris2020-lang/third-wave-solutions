/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

  var sellerEndpoint = "https://formsubmit.app/f/xvfwex8rvq";

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
    link.href = /(?:^|\/)sell\.html$/.test(window.location.pathname)
      ? "#seller-form-short"
      : "sell.html#seller-form-short";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  // Configure the seller form for file uploads. Keep the upload control in the
  // form itself; the FormSubmit endpoint receives the multipart POST directly.
  var sellerForm = document.getElementById("sellerForm");
  if (sellerForm) {
    sellerForm.action = sellerEndpoint;
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

  // FormSubmit endpoints use a hidden iframe so visitors stay on the page.
  // File submissions navigate normally so the browser sends multipart data.
  var forms = document.querySelectorAll(
    'form[action*="formsubmit.co/"], form[action*="formsubmit.app/"]'
  );
  if (!forms.length) return;

  var frameName = "tw-form-target";
  var frame = document.createElement("iframe");
  frame.name = frameName;
  frame.title = "Form submission";
  frame.setAttribute("aria-hidden", "true");
  frame.style.display = "none";
  document.body.appendChild(frame);

  Array.prototype.forEach.call(forms, function (form) {
    var status = form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var timer = null;
    var hasFileUpload = !!form.querySelector('input[type="file"]');

    if (!hasFileUpload) form.target = frameName;

    function say(message, color) {
      if (!status) return;
      status.textContent = message;
      status.style.color = color;
      status.style.fontWeight = "600";
    }

    form.addEventListener("submit", function () {
      if (button) {
        button.disabled = true;
        button.innerHTML = hasFileUpload ? "Uploading…" : "Sending…";
      }
      say(
        hasFileUpload ? "Uploading your files and sending your submission…" : "Sending your message…",
        "#0a5f59"
      );

      // Do not guess whether a file upload succeeded: FormSubmit's response
      // page is shown in this tab for upload forms.
      if (hasFileUpload) return;

      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        form.reset();
        if (button) {
          button.disabled = false;
          button.innerHTML = original;
        }
        say(
          "Thank you — your message has been sent. We usually reply within one working day. " +
            "For anything urgent call or WhatsApp 0101 490 036.",
          "#0a5f59"
        );
      }, 1800);
    });
  });
})();
