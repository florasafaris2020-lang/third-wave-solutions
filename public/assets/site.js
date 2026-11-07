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

  // ------------------------------------------------------------------
  // Seller form -> Cloudflare Worker
  // ------------------------------------------------------------------
  var sellerForm = document.getElementById("sellerForm");
  if (sellerForm) {
    var sellerStatus = document.getElementById("formStatus");
    var sellerSuccess = document.getElementById("formSuccess");

    sellerForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      var button = sellerForm.querySelector("button[type='submit']");
      var original = button ? button.innerHTML : "";
      var apiBase = (window.TW_CONFIG && window.TW_CONFIG.apiBase) || "";
      var endpoint = apiBase.replace(/\/$/, "") + "/api/business-submit";

      if (!apiBase && /\.github\.io$/.test(location.hostname)) {
        if (sellerStatus) {
          sellerStatus.style.display = "";
          sellerStatus.textContent =
            "The submission service is not configured yet. Please email s.lakhani1@aim.com or call 0101 490 036.";
          sellerStatus.style.color = "#8a2f22";
        }
        return;
      }

      if (sellerStatus) {
        sellerStatus.style.display = "";
        sellerStatus.textContent = "Sending your business details…";
        sellerStatus.style.color = "#0a5f59";
        sellerStatus.style.fontWeight = "600";
      }
      if (sellerSuccess) sellerSuccess.style.display = "none";

      if (button) {
        button.disabled = true;
        button.innerHTML = "Sending…";
      }

      try {
        var response = await fetch(endpoint, {
          method: "POST",
          body: new FormData(sellerForm),
          headers: { Accept: "application/json" }
        });
        var data = {};
        try {
          data = await response.json();
        } catch (_) {
          data = {};
        }
        if (!response.ok) {
          throw new Error(data.error || "The submission could not be sent. Please try again.");
        }

        sellerForm.reset();
        if (sellerStatus) sellerStatus.style.display = "none";
        if (sellerSuccess) {
          sellerSuccess.style.display = "block";
          sellerSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (error) {
        if (sellerStatus) {
          sellerStatus.style.display = "";
          sellerStatus.textContent =
            "Sorry — " +
            error.message +
            " You can also email s.lakhani1@aim.com or call 0101 490 036.";
          sellerStatus.style.color = "#8a2f22";
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = original;
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // Other public forms still use FormSubmit into a hidden iframe.
  // ------------------------------------------------------------------
  var forms = document.querySelectorAll(
    'form[action*="formsubmit.co/"], form[action*="formsubmit.app/"]'
  );
  forms = Array.prototype.filter.call(forms, function (form) {
    return !form.hasAttribute("data-worker-form");
  });

  if (forms.length) {
    var frameName = "tw-form-target";
    var frame = document.createElement("iframe");
    frame.name = frameName;
    frame.title = "Form submission";
    frame.setAttribute("aria-hidden", "true");
    frame.style.display = "none";
    document.body.appendChild(frame);

    Array.prototype.forEach.call(forms, function (form) {
      var status =
        form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
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
  }

  // ------------------------------------------------------------------
  // Approved listings -> render from public/data/businesses.json
  // ------------------------------------------------------------------
  var approvedContainer = document.getElementById("approvedListings");
  if (approvedContainer) {
    fetch("data/businesses.json", { cache: "no-store" })
      .then(function (response) {
        return response.ok ? response.json() : [];
      })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) return;

        var heading = document.getElementById("approvedHeading");
        if (heading) heading.style.display = "";

        list.forEach(function (item) {
          approvedContainer.appendChild(buildListingCard(item));
        });
      })
      .catch(function () {
        /* Leave the sample listings untouched if the data file is unavailable. */
      });
  }

  function buildListingCard(item) {
    var article = document.createElement("article");
    article.className = "card listing";

    var media = document.createElement("div");
    media.className = "listing-media";
    var image = document.createElement("img");
    image.src = "assets/img/retail.jpg";
    image.alt = (item.name || "Business") + " listing";
    image.loading = "lazy";
    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Approved listing";
    media.appendChild(image);
    media.appendChild(badge);

    var body = document.createElement("div");
    body.className = "listing-body";

    var top = document.createElement("div");
    top.className = "listing-top";
    var title = document.createElement("h3");
    title.textContent = item.name || "Business for sale";
    var price = document.createElement("span");
    price.className = "ask";
    price.textContent = item.price || "Price on request";
    top.appendChild(title);
    top.appendChild(price);

    var location = document.createElement("span");
    location.className = "loc";
    location.textContent = item.location || "Kenya";

    var description = document.createElement("p");
    description.className = "desc";
    description.textContent = item.description || "Contact us for the full profile.";

    var meta = document.createElement("div");
    meta.className = "listing-meta";
    var contact = document.createElement("span");
    contact.textContent = "Contact ";
    var contactValue = document.createElement("b");
    contactValue.textContent = item.contact || "Third Wave Solutions";
    contact.appendChild(contactValue);
    meta.appendChild(contact);

    var link = document.createElement("a");
    link.className = "btn btn--ghost btn--sm";
    link.href = "#listing-enquiry";
    link.style.marginTop = ".9rem";
    link.style.alignSelf = "flex-start";
    link.textContent = "Request full profile";

    body.appendChild(top);
    body.appendChild(location);
    body.appendChild(description);
    body.appendChild(meta);
    body.appendChild(link);

    article.appendChild(media);
    article.appendChild(body);
    return article;
  }
})();
