/* Third Wave Solutions — listing images for the owner dashboard.
 *
 * What this does:
 *
 * 1. The "Image path" box on admin.html is written straight into
 *    data/listings.json and rendered as <img src>, so a typo publishes a broken
 *    picture. The picker below previews the path and lists the photos that ship
 *    in assets/img.
 *
 * 2. Sellers send photos through the sell form, where FormSubmit stores them as
 *    signed links that expire — they never reach the repository on their own.
 *    "Upload the seller's photo" takes the downloaded cover photo, and "More
 *    photos" takes the rest of the set; both are resized in the browser and
 *    committed to assets/img with the same GitHub token the dashboard uses.
 *    The cover fills the image path, the rest are collected in `photos`, which
 *    admin.js copies into the listing and listings.js shows as a gallery.
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

  /* ---------------- shared helpers ---------------- */

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
          message: "Listing photo: " + path.replace(/^public\//, ""),
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

  /* ---------------- the cover photo ---------------- */

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
    "Cover photo — upload the seller's own picture (download it from the FormSubmit dashboard; those links expire). " +
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

    // The file lives under public/ in the repository but is referenced
    // without it, because GitHub Pages serves that folder as the site root.
    var fileName = "listing-" + slug + ".jpg";
    var repoPath = "public/assets/img/" + fileName;
    var imagePath = "assets/img/" + fileName;
    saveButton.disabled = true;
    uploadSay("Saving " + imagePath + " to the repository…");

    toBase64(pending.blob)
      .then(function (base64) {
        return commitImage(repoPath, base64, token);
      })
      .then(function () {
        input.value = imagePath;
        frame.classList.remove("is-missing");
        preview.onload = null;
        preview.onerror = null;
        preview.src = pendingUrl;
        state.className = "img-picker-state is-good";
        state.textContent = imagePath;
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

  /* ---------------- the gallery photos ---------------- */

  // Read by admin.js when it builds the listing object.
  var photos = [];
  window.twsPhotos = photos;

  var galleryBox = document.createElement("div");
  galleryBox.className = "img-upload";
  galleryBox.style.display = "grid";
  galleryBox.style.gap = ".4rem";
  galleryBox.style.marginTop = ".55rem";
  galleryBox.style.paddingTop = ".55rem";
  galleryBox.style.borderTop = "1px dashed var(--line)";

  var galleryTitle = document.createElement("p");
  galleryTitle.className = "img-picker-state";
  galleryTitle.style.fontWeight = "600";
  galleryTitle.style.color = "var(--ink)";
  galleryTitle.textContent = "More photos — shown as a gallery under the main picture";

  var galleryInput = document.createElement("input");
  galleryInput.type = "file";
  galleryInput.id = "f-image-gallery";
  galleryInput.accept = "image/jpeg,image/png,image/webp,image/*";
  galleryInput.multiple = true;
  galleryInput.setAttribute("aria-label", "Extra seller photos for the listing gallery");

  var thumbs = document.createElement("div");
  thumbs.style.display = "grid";
  thumbs.style.gridTemplateColumns = "repeat(auto-fill, minmax(96px, 1fr))";
  thumbs.style.gap = ".5rem";

  var galleryState = document.createElement("p");
  galleryState.className = "img-picker-state";

  var GALLERY_HINT =
    "Optional. Each photo is resized to " + MAX_SIDE + " px and committed as listing-<slug>-g1.jpg, -g2.jpg… " +
    "Use “Cover” to move one up to the main picture.";

  function gallerySay(text, kind) {
    galleryState.className = "img-picker-state" + (kind ? " is-" + kind : "");
    galleryState.textContent = text;
  }

  gallerySay(GALLERY_HINT);
  galleryBox.appendChild(galleryTitle);
  galleryBox.appendChild(galleryInput);
  galleryBox.appendChild(thumbs);
  galleryBox.appendChild(galleryState);
  side.appendChild(galleryBox);

  function smallButton(label, variant) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn " + variant + " btn--sm";
    button.textContent = label;
    button.style.fontSize = ".68rem";
    button.style.padding = ".15rem .35rem";
    return button;
  }

  function makeCover(index) {
    var chosen = photos[index];
    if (!chosen) return;
    var previous = currentPath();
    photos.splice(index, 1);
    // The old main picture joins the gallery, so nothing is lost in the swap.
    if (previous && previous.indexOf("assets/img/") === 0) photos.unshift(previous);
    input.value = chosen;
    renderThumbs();
    gallerySay("Cover is now " + chosen + (previous ? " — the previous main picture moved into the gallery." : "."), "good");
  }

  function renderThumbs() {
    thumbs.innerHTML = "";
    photos.forEach(function (path, index) {
      var cell = document.createElement("div");
      cell.style.border = "1px solid var(--line)";
      cell.style.borderRadius = "6px";
      cell.style.overflow = "hidden";
      cell.style.background = "#fff";

      var image = document.createElement("img");
      image.src = path;
      image.alt = "Gallery photo " + (index + 1);
      image.style.width = "100%";
      image.style.height = "68px";
      image.style.objectFit = "cover";
      image.style.display = "block";

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "2px";
      actions.style.padding = "2px";
      actions.style.background = "#f4f6f8";

      var cover = smallButton("Cover", "btn--ghost");
      cover.addEventListener("click", function () {
        makeCover(index);
      });

      var remove = smallButton("Remove", "btn--danger");
      remove.addEventListener("click", function () {
        photos.splice(index, 1);
        renderThumbs();
        gallerySay("Removed from the listing. The file stays in the repository if you want it back.", "good");
      });

      actions.appendChild(cover);
      actions.appendChild(remove);
      cell.appendChild(image);
      cell.appendChild(actions);
      thumbs.appendChild(cell);
    });
  }

  // admin.js calls this when it loads a listing (or starts a new one).
  window.twsSetPhotos = function (list) {
    photos.length = 0;
    (Array.isArray(list) ? list : []).forEach(function (path) {
      if (path) photos.push(String(path));
    });
    renderThumbs();
  };

  galleryInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(galleryInput.files || []);
    galleryInput.value = "";
    if (!files.length) return;

    var slug = slugForFile();
    if (!slug) {
      gallerySay("Type the public title first — photos are saved under the listing's name.", "bad");
      return;
    }
    var token = readToken();
    if (!token) {
      gallerySay(
        "Sign in with your GitHub token first (see \"Sign in to publish listings\") — saving photos writes to the repository.",
        "bad"
      );
      return;
    }

    var total = files.length;
    var saved = 0;
    gallerySay("Saving 0 of " + total + "…");

    files
      .reduce(function (chain, file) {
        return chain.then(function () {
          if (!/^image\//i.test(file.type)) {
            throw new Error(file.name + " is not a photo the browser can open.");
          }
          return shrink(file).then(function (result) {
            var fileName = "listing-" + slug + "-g" + (photos.length + 1) + ".jpg";
            return toBase64(result.blob)
              .then(function (base64) {
                return commitImage("public/assets/img/" + fileName, base64, token);
              })
              .then(function () {
                photos.push("assets/img/" + fileName);
                saved += 1;
                renderThumbs();
                gallerySay("Saved " + saved + " of " + total + "…");
              });
          });
        });
      }, Promise.resolve())
      .then(function () {
        gallerySay(
          "Saved " + total + " gallery photo(s). They publish with the listing, in this order.",
          "good"
        );
      })
      .catch(function (error) {
        gallerySay(describeUploadError(error), "bad");
      });
  });

  renderThumbs();
  render();
})();
