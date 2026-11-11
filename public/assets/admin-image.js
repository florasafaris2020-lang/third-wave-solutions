/* Third Wave Solutions — listing images for the owner dashboard.
 *
 * Two jobs:
 *
 * 1. The "Image path" box on admin.html is written straight into
 *    data/listings.json and rendered as <img src>, so a typo publishes a broken
 *    picture. The picker below previews the path and lists the photos that ship
 *    in assets/img.
 *
 * 2. Photos a seller attaches to the sell form are stored by FormSubmit and
 *    offered as signed links (they expire), so they never reach the repository
 *    on their own — which is why a listing could only ever show a stock picture.
 *    "Upload the seller's photo" resizes the downloaded photo in the browser,
 *    commits it to assets/img with the same GitHub token the dashboard uses,
 *    and fills the image path in for you.
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

  // Repository the dashboard publishes to — must match admin.js.
  var OWNER = "florasafaris2020-lang";
  var REPO = "third-wave-solutions";
  var BRANCH = "main";
  var TOKEN_KEY = "tws-admin-token";
  var API = "https://api.github.com";

  var MAX_SIDE = 1600;
  var QUALITY = 0.82;

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
      state.textContent = warning
        ? warning
        : "No file at " + shown + ". Commit the photo to public/assets/img, then pick it above or type its path.";
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

  /* ---------------- the seller's own photo ---------------- */

  var upload = document.createElement("div");
  upload.className = "img-upload";
  upload.style.display = "grid";
  upload.style.gap = ".4rem";
  upload.style.marginTop = ".55rem";
  upload.style.paddingTop = ".55rem";
  upload.style.borderTop = "1px dashed var(--line)";

  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "f-image-file";
  fileInput.accept = "image/jpeg,image/png,image/webp,image/*";
  fileInput.setAttribute("aria-label", "Seller photo to upload to the site");

  var saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn btn--primary btn--sm";
  saveButton.textContent = "Save photo to site images";
  saveButton.disabled = true;

  var uploadState = document.createElement("p");
  uploadState.className = "img-picker-state";

  var HINT =
    "Upload the seller's own photo (download it from the FormSubmit dashboard — those links expire). " +
    "It is resized to " + MAX_SIDE + " px and committed to assets/img as listing-<slug>.jpg.";

  function uploadSay(text, kind) {
    uploadState.className = "img-picker-state" + (kind ? " is-" + kind : "");
    uploadState.textContent = text;
  }

  uploadSay(HINT);
  upload.appendChild(fileInput);
  upload.appendChild(saveButton);
  upload.appendChild(uploadState);
  side.appendChild(upload);

  var pending = null;
  var pendingUrl = "";

  function readToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  }

  function slugForFile() {
    var titleBox = document.getElementById("f-title");
    var title = String((titleBox && titleBox.value) || "").trim();
    if (!title) return "";
    return (
      title
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || ""
    );
  }

  // Draw the photo onto a canvas so a 6 MB phone picture becomes a couple of
  // hundred KB before it is committed.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        var width = Math.max(1, Math.round(image.naturalWidth * scale));
        var height = Math.max(1, Math.round(image.naturalHeight * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error("That photo could not be prepared — try a JPG or PNG copy."));
              return;
            }
            var name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
            resolve({ blob: blob, width: width, height: height, name: name });
          },
          "image/jpeg",
          QUALITY
        );
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(
          new Error(
            "That file is not an image the browser can open. iPhone HEIC photos must be exported as JPG first."
          )
        );
      };
      image.src = url;
    });
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(",")[1] || "");
      };
      reader.onerror = function () {
        reject(new Error("That photo could not be read from disk."));
      };
      reader.readAsDataURL(blob);
    });
  }

  function apiFailure(response) {
    return response.text().then(function (text) {
      var message = text;
      try {
        message = JSON.parse(text).message || text;
      } catch (error) {
        message = text;
      }
      var failure = new Error(message || "GitHub returned HTTP " + response.status);
      failure.status = response.status;
      throw failure;
    });
  }

  function commitImage(path, base64, token) {
    var url = API + "/repos/" + OWNER + "/" + REPO + "/contents/" + path;
    var headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    return fetch(url + "?ref=" + BRANCH, { headers: headers })
      .then(function (response) {
        // 404 simply means this listing has no photo committed yet.
        if (response.status === 404) return null;
        if (!response.ok) return apiFailure(response);
        return response.json();
      })
      .then(function (existing) {
        var body = {
          message: "Listing photo: " + path.replace("assets/img/", ""),
          content: base64,
          branch: BRANCH
        };
        // Replacing an existing photo needs its blob SHA.
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(url, {
          method: "PUT",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify(body)
        });
      })
      .then(function (response) {
        if (!response.ok) return apiFailure(response);
        return response.json();
      });
  }

  function describeUploadError(error) {
    if (error.status === 401) {
      return "GitHub rejected the token (401). Sign in again with a current token, then retry.";
    }
    if (error.status === 403) {
      return "GitHub refused the upload (403). The token needs Contents: Read and write on this repository.";
    }
    if (error.status === 404) {
      return "GitHub could not find the repository (404). Check the token covers " + OWNER + "/" + REPO + " with Contents: Read and write.";
    }
    if (error.status === 409 || error.status === 422) {
      return "The file changed while saving. Try again — the dashboard re-reads the existing photo.";
    }
    return error.message || "The photo could not be saved to GitHub.";
  }

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    pending = null;
    saveButton.disabled = true;
    if (pendingUrl) {
      URL.revokeObjectURL(pendingUrl);
      pendingUrl = "";
    }
    if (!file) {
      uploadSay(HINT);
      return;
    }
    if (!/^image\//i.test(file.type)) {
      uploadSay("That is not an image file. Choose the seller's JPG, PNG or WebP photo.", "bad");
      return;
    }

    uploadSay("Preparing " + file.name + "…");
    shrink(file)
      .then(function (result) {
        pending = result;
        pendingUrl = URL.createObjectURL(result.blob);
        saveButton.disabled = false;
        // Show the local copy straight away; the site copy only exists after
        // the Pages build finishes.
        frame.classList.remove("is-missing");
        preview.onload = null;
        preview.onerror = null;
        preview.src = pendingUrl;
        uploadSay(
          "Ready: " + result.width + " × " + result.height + " px, " +
            Math.max(1, Math.round(result.blob.size / 1024)) + " KB (was " +
            Math.max(1, Math.round(file.size / 1024)) + " KB).",
          "good"
        );
      })
      .catch(function (error) {
        uploadSay(error.message || "That photo could not be prepared.", "bad");
      });
  });

  saveButton.addEventListener("click", function () {
    if (!pending) return;

    var slug = slugForFile();
    if (!slug) {
      uploadSay("Type the public title above first — the photo is saved under the listing's name.", "bad");
      return;
    }

    var token = readToken();
    if (!token) {
      uploadSay(
        "Sign in with your GitHub token first (see \"Sign in to publish listings\") — saving a photo writes to the repository.",
        "bad"
      );
      return;
    }

    var path = "assets/img/listing-" + slug + ".jpg";
    saveButton.disabled = true;
    uploadSay("Saving " + path + " to the repository…");

    toBase64(pending.blob)
      .then(function (base64) {
        return commitImage(path, base64, token);
      })
      .then(function () {
        input.value = path;
        frame.classList.remove("is-missing");
        preview.onload = null;
        preview.onerror = null;
        preview.src = pendingUrl;
        state.className = "img-picker-state is-good";
        state.textContent = path;
        saveButton.disabled = false;
        uploadSay(
          "Saved. GitHub Pages publishes it in about a minute — the thumbnail above is your local copy until then.",
          "good"
        );
      })
      .catch(function (error) {
        saveButton.disabled = false;
        uploadSay(describeUploadError(error), "bad");
      });
  });

  render();
})();
