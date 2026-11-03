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

  // Forms post straight to the FormSubmit endpoint (https://formsubmit.co/el/tugozu);
  // formsubmit.co ignores _next unless it is an absolute URL, so build it here.
  var forms = document.querySelectorAll('form[action*="formsubmit.co/el/"]');
  Array.prototype.forEach.call(forms, function (form) {
    var next = document.createElement("input");
    next.type = "hidden";
    next.name = "_next";
    next.value = new URL("thanks.html", window.location.href).href;
    form.appendChild(next);

    // Guard against double submits while the browser is navigating away.
    form.addEventListener("submit", function () {
      var button = form.querySelector("button[type='submit']");
      if (!button) return;
      window.setTimeout(function () {
        button.disabled = true;
        button.innerHTML = "Sending…";
      }, 0);
    });
  });
})();
