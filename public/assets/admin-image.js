/* Third Wave Solutions — listing image helper for the owner dashboard.
 *
 * The "Image path" box on admin.html is written straight into
 * data/listings.json, and the public listing renders it as <img src>. A typo
 * therefore publishes a broken picture, and nothing on the page says so. This
 * adapter adds a live preview plus a picker of the images that actually ship in
 * assets/img, without touching admin.js.
 */
(function () {
  "use strict";

  // admin.js uses this when the box is left empty.
  var FALLBACK = "assets/img/office.jpg";

  // Files committed under public/assets/img. Keep in step with the folder;
  // any other path can still be typed by hand.
  var IMAGES = [
    { file: "cafe.jpg", label: "Café / restaurant / food" },
    { file: "salon.jpg", label: "Salon / barber / spa" },
    { file: "retail.jpg", label: "Shop / mini-mart / hardware" },
    { file: "bakery.jpg", label: "Bakery" },
    { file: "pos.jpg", label: "Till / counter / point of sale" },
    { file: "supermarket.jpg", label: "Supermarket / wholesale" },
    { file: "office.jpg", label: "Office / services / generic" },
    { file: "documents.jpg", label: "Documents / paperwork" },
    { file: "handshake.jpg", label: "Handshake / completed deal" },
    { file: "vetting.jpg", label: "Vetting / inspection" }
  ];

  var input = document.getElementById("f-image");
  if (!input || !input.parentNode) return;

  var wrap = document.createElement("div");
  wrap.className = "img-picker";

  var frame = document.createElement("div");
  frame.className = "img-picker-frame";
  var preview = document.createElement("img");
  preview.alt = "Preview of the listing image";
  var missing = document.createElement("span");
  missing.className = "img-picker-missing";
  missing.textContent = "No file at this path";
  frame.appendChild(preview);
  frame.appendChild(missing);

  var side = document.createElement("div");
  side.className = "img-picker-side";

  var picker = document.createElement("select");
  picker.id = "f-image-picker";
  picker.setAttribute("aria-label", "Pick an existing listing image");
  var none = document.createElement("option");
  none.value = "";
  none.textContent = "Pick an existing image…";
  picker.appendChild(none);
  IMAGES.forEach(function (image) {
    var option = document.createElement("option");
    option.value = "assets/img/" + image.file;
    option.textContent = image.label + " — " + image.file;
    picker.appendChild(option);
  });

  var state = document.createElement("p");
  state.className = "img-picker-state";

  side.appendChild(picker);
  side.appendChild(state);
  wrap.appendChild(frame);
  wrap.appendChild(side);
  input.parentNode.appendChild(wrap);

  function currentPath() {
    return String(input.value || "").trim();
  }

  function isListed(path) {
    return IMAGES.some(function (image) {
      return "assets/img/" + image.file === path;
    });
  }

  function render() {
    var path = currentPath();
    var shown = path || FALLBACK;
    var warning = "";

    if (/^(?:https?:)?\/\//i.test(path)) {
      warning = "Use a path inside the site, not a full web address.";
    } else if (path.charAt(0) === "/") {
      warning = "Drop the leading slash: assets/img/…";
    }

    frame.classList.remove("is-missing");
    state.className = "img-picker-state";
    state.textContent = path
      ? "Checking " + path + "…"
      : "Empty — the listing will use " + FALLBACK;
    picker.value = isListed(path) ? path : "";

    preview.onload = function () {
      frame.classList.remove("is-missing");
      if (warning) {
        state.className = "img-picker-state is-bad";
        state.textContent = warning;
        return;
      }
      state.className = "img-picker-state is-good";
      state.textContent = path
        ? path + " · " + preview.naturalWidth + " × " + preview.naturalHeight + " px"
        : "Empty — using " + FALLBACK;
    };
    preview.onerror = function () {
      frame.classList.add("is-missing");
      state.className = "img-picker-state is-bad";
      state.textContent =
        "No file at " + shown + ". Commit the photo to public/assets/img, then pick it above or type its path.";
    };
    preview.src = shown;
  }

  picker.addEventListener("change", function () {
    if (!picker.value) return;
    input.value = picker.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    render();
  });

  input.addEventListener("input", render);
  input.addEventListener("change", render);

  // admin.js loads a listing for editing by assigning .value, which fires no
  // event; route those assignments through the preview as well.
  var descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor && descriptor.get && descriptor.set) {
    Object.defineProperty(input, "value", {
      configurable: true,
      get: function () {
        return descriptor.get.call(input);
      },
      set: function (value) {
        descriptor.set.call(input, value);
        render();
      }
    });
  }

  render();
})();
