/* Third Wave Solutions — listings data rendering
 *
 * Listings live in data/listings.json. The owner dashboard (admin.html) writes
 * approved listings into that file through the GitHub API, and GitHub Pages
 * publishes the change, so this script is the only place listings are drawn.
 * If the fetch fails the static cards already in the page stay visible.
 */
(function () {
  "use strict";

  var DATA_URL = "data/listings.json";
  var LOC_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function live(listings) {
    return listings.filter(function (l) {
      return (l.status || "published") === "published";
    });
  }

  function detailHref(listing) {
    if (listing.page) return listing.page;
    return "listing.html?slug=" + encodeURIComponent(listing.slug || "");
  }

  function metaRows(listing) {
    var rows = [];
    if (listing.revenue) rows.push(["Revenue", listing.revenue]);
    if (listing.cashflow) rows.push(["Cash flow", listing.cashflow]);
    if (listing.staff) rows.push(["Staff", listing.staff]);
    if (listing.lease) rows.push(["Lease", listing.lease]);
    if (listing.extra && listing.extra.label) rows.push([listing.extra.label, listing.extra.value]);
    return rows;
  }

  function cardHTML(listing) {
    var rows = metaRows(listing).slice(0, 3);
    return (
      '<article class="card listing">' +
        '<div class="listing-media">' +
          '<img src="' + esc(listing.image || "assets/img/office.jpg") + '" alt="' + esc(listing.title) + '" loading="lazy">' +
          (listing.badge ? '<span class="badge">' + esc(listing.badge) + "</span>" : "") +
        "</div>" +
        '<div class="listing-body">' +
          '<div class="listing-top"><h3>' + esc(listing.title) + "</h3>" +
          '<span class="ask">' + esc(listing.ask || "Ask for price") + "</span></div>" +
          '<span class="loc">' + LOC_SVG + esc(listing.location || "Kenya") + "</span>" +
          '<p class="desc">' + esc(listing.summary || "") + "</p>" +
          (rows.length
            ? '<div class="listing-meta">' +
              rows.map(function (row) {
                return "<span>" + esc(row[0]) + " <b>" + esc(row[1]) + "</b></span>";
              }).join("") +
              "</div>"
            : "") +
          '<a class="btn btn--ghost btn--sm" href="' + esc(detailHref(listing)) +
          '" style="margin-top:.9rem; align-self:flex-start;">View details</a>' +
        "</div>" +
      "</article>"
    );
  }

  function renderGrid(listings) {
    var grid = document.querySelector("[data-listings-grid]");
    if (!grid) return;
    grid.innerHTML = listings.length
      ? listings.map(cardHTML).join("")
      : '<p class="muted">No businesses are listed publicly at the moment. ' +
        'New submissions are approved before publication — <a href="sell.html">submit yours</a> ' +
        "or ask us for the current list.</p>";
  }

  function renderOptions(listings) {
    var select = document.querySelector("[data-listing-options]");
    if (!select) return;
    var keep = [];
    Array.prototype.forEach.call(select.options, function (option, index) {
      if (index === 0 || option.hasAttribute("data-keep") || /full current list/i.test(option.textContent)) keep.push(option.outerHTML);
    });
    var options = listings.map(function (listing) {
      var label = listing.title + (listing.location ? " — " + listing.location : "");
      return '<option value="' + esc(label) + '">' + esc(label) + "</option>";
    });
    select.innerHTML = keep[0] + options.join("") + (keep[1] || "");
  }

  // Extra photos are shown as thumbnails under the main picture, and each one
  // opens the full-size file. The cover is already displayed above, so it is
  // skipped if it also appears in the list.
  function renderGallery(listing) {
    var host = document.getElementById("ld-gallery");
    if (!host) return;

    var extras = (Array.isArray(listing.photos) ? listing.photos : []).filter(function (photo) {
      return photo && photo !== listing.image;
    });

    if (!extras.length) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }

    host.hidden = false;
    host.innerHTML = extras
      .map(function (photo, index) {
        var alt = listing.title + " — photo " + (index + 2);
        return (
          '<a href="' + esc(photo) + '" target="_blank" rel="noopener" title="Open full size">' +
          '<img src="' + esc(photo) + '" alt="' + esc(alt) + '" loading="lazy">' +
          "</a>"
        );
      })
      .join("");
  }

  // The gallery block and its styles are created here, so the listing template
  // keeps working untouched and a listing without extra photos shows nothing.
  function ensureGallery() {
    var anchor = document.getElementById("ld-image");
    if (!anchor) return;
    var card = anchor.closest(".card");
    if (!card || !card.parentNode) return;

    if (!document.getElementById("ld-gallery")) {
      var host = document.createElement("div");
      host.id = "ld-gallery";
      host.className = "listing-gallery";
      host.hidden = true;
      card.parentNode.insertBefore(host, card.nextSibling);
    }

    if (!document.getElementById("ld-gallery-style")) {
      var style = document.createElement("style");
      style.id = "ld-gallery-style";
      style.textContent =
        ".listing-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.6rem;margin:.8rem 0 0}" +
        ".listing-gallery[hidden]{display:none}" +
        ".listing-gallery a{display:block;aspect-ratio:4/3;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);background:#eef1f4}" +
        ".listing-gallery img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}" +
        ".listing-gallery a:hover img,.listing-gallery a:focus-visible img{transform:scale(1.04)}" +
        "@media (max-width:520px){.listing-gallery{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}}";
      document.head.appendChild(style);
    }
  }

  function renderDetail(listings) {
    var root = document.querySelector("[data-listing-detail]");
    if (!root) return;

    var slug = (new URLSearchParams(window.location.search).get("slug") || "").trim();
    var listing = listings.filter(function (item) {
      return item.slug === slug;
    })[0];

    var empty = document.getElementById("ld-empty");
    var body = document.getElementById("ld-body");

    if (!listing) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (body) body.hidden = false;

    document.title = listing.title + " — Third Wave Solutions";

    function set(id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value || "";
    }

    set("ld-crumb-title", listing.title);
    set("ld-category", listing.category || "Business for sale");
    set("ld-title", listing.title);
    set("ld-summary", listing.summary || "");
    set("ld-location", listing.location || "Kenya");
    set("ld-ask", listing.ask || "Ask for price");
    set("ld-badge", listing.badge || "");

    var image = document.getElementById("ld-image");
    if (image) {
      image.src = listing.image || "assets/img/office.jpg";
      image.alt = listing.title;
    }

    ensureGallery();
    renderGallery(listing);

    var meta = document.getElementById("ld-meta");
    if (meta) {
      meta.innerHTML = metaRows(listing)
        .map(function (row) {
          return "<li><span>" + esc(row[0]) + "</span><span>" + esc(row[1]) + "</span></li>";
        })
        .join("");
    }

    var checks = document.getElementById("ld-checks");
    if (checks) {
      var labels = [
        ["cashflow", "Cash flow verified"],
        ["kra", "KRA compliant"],
        ["licences", "Licences current"],
        ["liabilities", "Hidden liabilities"]
      ];
      checks.innerHTML = labels
        .map(function (pair) {
          var value = (listing.checks && listing.checks[pair[0]]) || "To be confirmed";
          var ok = /^(yes|verified|confirmed|none|current|no)$/i.test(String(value).trim());
          return (
            '<li class="' + (ok ? "ok" : "warn") + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            (ok ? '<path d="m5 13 4 4L19 7"/>' : '<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>') +
            "</svg><span>" + esc(pair[1]) + ": <b>" + esc(value) + "</b></span></li>"
          );
        })
        .join("");
    }

    var enquiry = document.getElementById("ld-enquiry");
    if (enquiry) {
      var business = enquiry.querySelector('[name="Business"]');
      if (business) business.value = listing.title + (listing.location ? " — " + listing.location : "");
      var subject = enquiry.querySelector('[name="_subject"]');
      if (subject) subject.value = "Listing enquiry: " + listing.title + " — Third Wave Solutions";
    }

    var notice = document.getElementById("ld-notice");
    if (notice) {
      notice.hidden = (listing.type || "sample") !== "sample";
    }

    var ask = document.getElementById("ld-ask-cta");
    if (ask) ask.textContent = listing.title;
  }

  function start() {
    var needsData =
      document.querySelector("[data-listings-grid]") ||
      document.querySelector("[data-listing-detail]") ||
      document.querySelector("[data-listing-options]");
    if (!needsData) return;

    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (doc) {
        var listings = live(Array.isArray(doc.listings) ? doc.listings : []);
        renderGrid(listings);
        renderOptions(listings);
        renderDetail(listings);
      })
      .catch(function () {
        // Leave the hand-written fallback cards in place; the detail template
        // reports the problem itself.
        var empty = document.getElementById("ld-empty");
        var body = document.getElementById("ld-body");
        if (empty && body) {
          empty.hidden = false;
          body.hidden = true;
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
