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

  // The photo-count pill is styled here so the shared stylesheet stays untouched,
  // the same way the gallery styles are. Called once per rendered grid.
  function ensureCardStyles() {
    if (document.getElementById("listing-card-style")) return;
    var style = document.createElement("style");
    style.id = "listing-card-style";
    style.textContent =
      ".photo-count{position:absolute;right:.7rem;bottom:.7rem;display:inline-flex;align-items:center;gap:.35rem;background:rgba(10,34,48,.82);color:#fff;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.28rem .55rem;border-radius:999px}" +
      ".photo-count svg{width:.9rem;height:.9rem}";
    document.head.appendChild(style);
  }

  function cardHTML(listing) {
    var rows = metaRows(listing).slice(0, 3);
    // The cover counts as a photo, so a listing with two extras says "3 photos".
    var extraPhotos = (Array.isArray(listing.photos) ? listing.photos : []).filter(function (photo) {
      return photo && photo !== listing.image;
    });
    var photoCount = extraPhotos.length + 1;
    var photoBadge = extraPhotos.length
      ? '<span class="photo-count" aria-label="' + photoCount + ' photos in this listing">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v10H4Z"/><circle cx="12" cy="13" r="3"/></svg>' +
        photoCount + " photos</span>"
      : "";
    return (
      '<article class="card listing">' +
        '<div class="listing-media">' +
          '<img src="' + esc(listing.image || "assets/img/office.jpg") + '" alt="' + esc(listing.title) + '" loading="lazy">' +
          (listing.badge ? '<span class="badge">' + esc(listing.badge) + "</span>" : "") +
          photoBadge +
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
    ensureCardStyles();
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

  // Every photo the listing has, cover first, as the lightbox walks them.
  var galleryPhotos = [];
  var lightboxState = { index: 0, opener: null };

  // Extra photos are shown as thumbnails under the main picture, and clicking
  // one opens the set in a lightbox. The cover is already displayed above, so
  // it is skipped in the strip — but the lightbox still includes it, because a
  // buyer flicking through wants the whole set in one place.
  function renderGallery(listing) {
    var host = document.getElementById("ld-gallery");
    if (!host) return;

    var extras = (Array.isArray(listing.photos) ? listing.photos : []).filter(function (photo) {
      return photo && photo !== listing.image;
    });

    galleryPhotos = [{ src: listing.image || "assets/img/office.jpg", alt: listing.title }];
    extras.forEach(function (photo, index) {
      galleryPhotos.push({ src: photo, alt: listing.title + " — photo " + (index + 2) });
    });

    if (!extras.length) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }

    host.hidden = false;
    host.innerHTML = extras
      .map(function (photo, index) {
        var position = index + 1;
        return (
          '<a class="listing-gallery-item" href="' + esc(photo) + '" data-lb-index="' + position +
          '" aria-label="Open photo ' + (position + 1) + " of " + galleryPhotos.length + '">' +
          '<img src="' + esc(photo) + '" alt="' + esc(galleryPhotos[position].alt) + '" loading="lazy">' +
          "</a>"
        );
      })
      .join("");
  }

  function lightbox() {
    return document.getElementById("ld-lightbox");
  }

  function showPhoto(index) {
    var box = lightbox();
    if (!box || !galleryPhotos.length) return;
    var total = galleryPhotos.length;
    lightboxState.index = ((index % total) + total) % total;
    var shot = galleryPhotos[lightboxState.index];

    var image = box.querySelector(".lb-image");
    image.src = shot.src;
    image.alt = shot.alt;
    box.querySelector(".lb-count").textContent = lightboxState.index + 1 + " of " + total;

    // A single photo has nowhere to step to.
    box.querySelector("[data-lb-prev]").hidden = total < 2;
    box.querySelector("[data-lb-next]").hidden = total < 2;
  }

  function openLightbox(index, opener) {
    var box = lightbox();
    if (!box) return;
    lightboxState.opener = opener || null;
    showPhoto(index);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    box.querySelector(".lb-close").focus();
  }

  function closeLightbox() {
    var box = lightbox();
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.style.overflow = "";
    var image = box.querySelector(".lb-image");
    if (image) image.removeAttribute("src");
    // Hand focus back to the thumbnail that opened it.
    if (lightboxState.opener && document.contains(lightboxState.opener)) {
      lightboxState.opener.focus();
    }
    lightboxState.opener = null;
  }

  function bindLightbox(box) {
    if (box.getAttribute("data-bound") === "1") return;
    box.setAttribute("data-bound", "1");

    box.addEventListener("click", function (event) {
      var target = event.target;
      if (target.hasAttribute("data-lb-close")) {
        closeLightbox();
      } else if (target.hasAttribute("data-lb-prev")) {
        showPhoto(lightboxState.index - 1);
      } else if (target.hasAttribute("data-lb-next")) {
        showPhoto(lightboxState.index + 1);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (box.hidden) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(lightboxState.index + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPhoto(lightboxState.index - 1);
        return;
      }
      if (event.key === "Tab") {
        // Keep focus inside the dialog while it is open.
        var buttons = Array.prototype.filter.call(box.querySelectorAll("button"), function (node) {
          return !node.hidden;
        });
        if (!buttons.length) return;
        var first = buttons[0];
        var last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function ensureLightbox() {
    var existing = lightbox();
    if (existing) return existing;

    var box = document.createElement("div");
    box.id = "ld-lightbox";
    box.className = "listing-lightbox";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Listing photos");
    box.innerHTML =
      '<div class="lb-backdrop" data-lb-close></div>' +
      '<div class="lb-shell">' +
        '<button type="button" class="lb-close" data-lb-close aria-label="Close photos">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        "</button>" +
        '<button type="button" class="lb-nav lb-prev" data-lb-prev aria-label="Previous photo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 5-7 7 7 7"/></svg>' +
        "</button>" +
        '<img class="lb-image" alt="">' +
        '<button type="button" class="lb-nav lb-next" data-lb-next aria-label="Next photo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg>' +
        "</button>" +
        '<p class="lb-count" aria-live="polite"></p>' +
      "</div>";
    document.body.appendChild(box);
    bindLightbox(box);
    return box;
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
      host.addEventListener("click", function (event) {
        var thumb = event.target.closest("[data-lb-index]");
        if (!thumb) return;
        // The href is the fallback for a browser that cannot open the dialog.
        event.preventDefault();
        openLightbox(Number(thumb.getAttribute("data-lb-index")) || 0, thumb);
      });
      card.parentNode.insertBefore(host, card.nextSibling);
    }

    ensureLightbox();

    if (!document.getElementById("ld-gallery-style")) {
      var style = document.createElement("style");
      style.id = "ld-gallery-style";
      style.textContent =
        ".listing-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.6rem;margin:.8rem 0 0}" +
        ".listing-gallery[hidden]{display:none}" +
        ".listing-gallery a{display:block;aspect-ratio:4/3;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);background:#eef1f4}" +
        ".listing-gallery img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}" +
        ".listing-gallery a:hover img,.listing-gallery a:focus-visible img{transform:scale(1.04)}" +
        ".listing-gallery a:focus-visible{outline:2px solid var(--teal-dark);outline-offset:2px}" +
        ".listing-lightbox{position:fixed;inset:0;z-index:120;display:grid;place-items:center}" +
        ".listing-lightbox[hidden]{display:none}" +
        ".lb-backdrop{position:absolute;inset:0;background:rgba(6,20,28,.9)}" +
        ".lb-shell{position:relative;display:grid;place-items:center;padding:2.4rem;max-width:100%}" +
        ".lb-image{max-width:min(1100px,92vw);max-height:82vh;border-radius:var(--radius);box-shadow:0 24px 60px rgba(0,0,0,.45);background:#0a2230}" +
        ".lb-close,.lb-nav{position:absolute;border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:50%;width:2.6rem;height:2.6rem;display:grid;place-items:center;cursor:pointer;transition:background .18s ease}" +
        ".lb-close:hover,.lb-nav:hover{background:rgba(255,255,255,.3)}" +
        ".lb-close:focus-visible,.lb-nav:focus-visible{outline:2px solid #7fd4c9;outline-offset:2px}" +
        ".lb-close svg,.lb-nav svg{width:1.15rem;height:1.15rem}" +
        ".lb-close{top:.2rem;right:.2rem}" +
        ".lb-nav{top:50%;transform:translateY(-50%)}" +
        ".lb-prev{left:.2rem}" +
        ".lb-next{right:.2rem}" +
        ".lb-count{position:absolute;left:50%;bottom:.2rem;transform:translateX(-50%);margin:0;color:#cfe0e7;font-size:.85rem;letter-spacing:.04em}" +
        "@media (max-width:520px){.listing-gallery{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}.lb-shell{padding:2.2rem .4rem}.lb-nav{width:2.2rem;height:2.2rem}}";
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
