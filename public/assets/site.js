/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

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

  // Send seller-form links to the site's FormSubmit-powered seller form instead
  // of the retired external Google Form.
  var sellerFormLinks = document.querySelectorAll('a[href*="docs.google.com/forms"]');
  Array.prototype.forEach.call(sellerFormLinks, function (link) {
    link.href = /(?:^|\/)sell\.html$/.test(window.location.pathname)
      ? "#seller-form-short"
      : "sell.html#seller-form-short";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  // FormSubmit endpoints use a hidden iframe so visitors stay on the page.
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

    form.target = frameName;

    function say(message, color) {
      if (!status) return;
      status.textContent = message;
      status.style.color = color;
      status.style.fontWeight = "600";
    }

    form.addEventListener("submit", function () {
      // The browser has already validated required fields at this point.
      if (button) {
        button.disabled = true;
        button.innerHTML = "Sending…";
      }
      say("Sending your message…", "#0a5f59");

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
