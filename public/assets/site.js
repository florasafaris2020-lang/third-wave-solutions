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

  // Forms: submit via FormSubmit AJAX so the visitor stays on the page.
  function wireForm(form, config) {
    var status = form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var endpoint = config.endpoint || ("https://formsubmit.co/ajax/" + config.email);
    var isFormSubmitApp = endpoint.indexOf("https://formsubmit.app/") === 0;
    var timestamp = config.timestampField ? form.querySelector('[name="' + config.timestampField + '"]') : null;
    var renderedAt = String(Date.now());

    if (config.endpoint) form.action = endpoint;
    if (timestamp) timestamp.value = renderedAt;

    if (config.fieldNames) {
      Object.keys(config.fieldNames).forEach(function (id) {
        var field = document.getElementById(id);
        if (field) field.name = config.fieldNames[id];
      });
    }

    if (config.gotchaName) {
      var honeypotField = form.querySelector("input[name='_honey']");
      if (honeypotField) {
        honeypotField.name = config.gotchaName;
        honeypotField.style.display = "none";
        honeypotField.tabIndex = -1;
        honeypotField.autocomplete = "off";
      }
    }

    function say(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.style.color = kind === "error" ? "#b4423a" : "#0a5f59";
      status.style.fontWeight = "600";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var data = new FormData(form);
      if (data.get(config.gotchaName || "_honey")) return; // silent bot trap

      if (button) {
        button.disabled = true;
        button.innerHTML = "Sending…";
      }
      say("", "ok");

      fetch(endpoint, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" }
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          var success = isFormSubmitApp
            ? result.ok && result.body && result.body.ok === true
            : result.ok && result.body && String(result.body.success) === "true";

          if (success) {
            form.reset();
            if (timestamp) timestamp.value = renderedAt;
            say("Thanks for your message. We’ll be in touch soon.", "ok");
          } else {
            var message = isFormSubmitApp && result.body && result.body.error && result.body.error.message
              ? result.body.error.message
              : "We could not send the form automatically. Please call or WhatsApp 0101 490 036, or email s.lakhani1@aim.com.";
            say(message, "error");
          }
        })
        .catch(function () {
          say("Network error — the form was not sent. Please call or WhatsApp 0101 490 036, or email s.lakhani1@aim.com.", "error");
        })
        .finally(function () {
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
        });
    });
  }

  var forms = [
    {
      id: "enquiryForm",
      endpoint: "https://formsubmit.app/f/m876hpuch8",
      gotchaName: "_gotcha",
      timestampField: "_ts",
      fieldNames: { name: "name", email: "email", message: "message" }
    },
    { id: "quoteForm", email: "s.lakhani1@aim.com" },
    { id: "listingEnquiryForm", email: "s.lakhani1@aim.com" },
    { id: "sellerForm", email: "s.lakhani1@aim.com" }
  ];
  forms.forEach(function (cfg) {
    var el = document.getElementById(cfg.id);
    if (el) wireForm(el, cfg);
  });
})();
