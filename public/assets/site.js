/* Third Wave Solutions — site behaviour */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Form delivery — FormSubmit (formsubmit.app, form dj2hrduj7x)
  //
  // Every form on the site posts here: buyer enquiries, listing enquiries,
  // vetting quote requests and the seller's business upload. Submissions are
  // stored in the formsubmit.app dashboard and emailed to the form's
  // notification address; admin.html then turns an approved submission into a
  // published listing. Docs: https://formsubmit.app/docs
  //
  // One path for every form: fetch + FormData. The endpoint accepts multipart
  // submissions (files included) and answers with JSON, so the visitor stays
  // on the page and we know whether the submission was really stored.
  // ---------------------------------------------------------------------
  var FORM_ENDPOINT = "https://formsubmit.app/f/dj2hrduj7x";

  // The endpoint accepts request bodies up to about 4.5 MB, so stop short of
  // that instead of failing after a long upload.
  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  // Sent as `_ts`: FormSubmit's time-to-submit spam check.
  var renderedAt = String(Date.now());

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

  // A link straight at a form endpoint would dump the visitor on the form
  // service's own page; send them to our seller form instead.
  var sellerLinks = document.querySelectorAll(
    'a[href*="docs.google.com/forms"], a[href*="formsubmit.app/f/"]'
  );
  Array.prototype.forEach.call(sellerLinks, function (link) {
    var onSellPage = /(?:^|\/)sell[.]html$/.test(window.location.pathname);
    link.href = onSellPage ? "#seller-form" : "sell.html#seller-form";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  var successMessage =
    "Thank you — your message has been sent. We usually reply within one working day. " +
    "For anything urgent call or WhatsApp 0101 490 036.";
  var failureMessage =
    "Sorry — we couldn't send your message just now. Please try again, or call or " +
    "WhatsApp 0101 490 036.";

  function statusFor(form) {
    return form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
  }

  function say(node, message, colour) {
    if (!node) return;
    node.textContent = message;
    node.style.color = colour;
    node.style.fontWeight = "600";
  }

  // A phone photo is 4–8 MB each, which blows the request limit on its own, so
  // a seller's pictures used to be the one thing that never arrived. Photos are
  // resized in the browser before sending; documents are left exactly as they
  // are.
  function shrinkImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        var width = Math.max(1, Math.round(image.naturalWidth * scale));
        var height = Math.max(1, Math.round(image.naturalHeight * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext("2d");
        // Photos with transparency go on white, not black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error("That photo could not be prepared."));
              return;
            }
            var name = String(file.name || "photo").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
            var prepared = new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
            resolve(prepared.size < file.size ? prepared : file);
          },
          "image/jpeg",
          quality
        );
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("not an image"));
      };
      image.src = url;
    });
  }

  function formDataBytes(data) {
    var total = 0;
    data.forEach(function (value) {
      if (value && typeof value === "object" && typeof value.size === "number") total += value.size;
    });
    return total;
  }

  function prepareFormData(form) {
    var data = new FormData(form);
    var entries = [];
    data.forEach(function (value, key) {
      entries.push({ key: key, value: value });
    });

    // Only photos worth shrinking, and never the documents.
    var photos = entries.filter(function (entry) {
      return /^image\//i.test(entry.value && entry.value.type) && entry.value.size > 400 * 1024;
    });

    return photos
      .reduce(function (chain, entry) {
        return chain.then(function () {
          return shrinkImage(entry.value, 1600, 0.82)
            .then(function (prepared) {
              entry.value = prepared;
            })
            .catch(function () {
              // A format the browser cannot draw (HEIC, for instance) is sent
              // untouched rather than silently dropped.
            });
        });
      }, Promise.resolve())
      .then(function () {
        // Rebuilt rather than edited: FormData.set() replaces only one of
        // several files that share a field name.
        var rebuilt = new FormData();
        entries.forEach(function (entry) {
          rebuilt.append(entry.key, entry.value);
        });
        rebuilt.set("_ts", renderedAt);
        var emailField = form.querySelector('input[type="email"]');
        if (emailField && emailField.value) rebuilt.set("_replyto", emailField.value);
        return rebuilt;
      });
  }

  // FormSubmit answers {ok: true, message} or {ok: false, error: {code, message}}.
  function describeFailure(result) {
    var error = (result && result.error) || {};
    var code = error.code;
    if (code === "rate_limited") {
      return "That was several messages in a row. Please wait a minute and send again, or call 0101 490 036.";
    }
    if (code === "payload_too_large") {
      return "The attachments were too large to send in one go. Please send fewer or smaller files, or email s.lakhani1@aim.com.";
    }
    if (code === "storage_quota_exceeded") {
      return "The form has run out of file storage. Please email your documents to s.lakhani1@aim.com instead.";
    }
    if (code === "form_inactive" || code === "form_not_found") {
      return "The form is not accepting submissions at the moment. Please call or WhatsApp 0101 490 036.";
    }
    return failureMessage + (error.message ? " (" + error.message + ")" : "");
  }

  var forms = document.querySelectorAll('form[action*="formsubmit"]');
  Array.prototype.forEach.call(forms, function (form) {
    var status = statusFor(form);
    var button = form.querySelector("button[type='submit']");
    var original = button ? button.innerHTML : "";
    var hasFiles = !!form.querySelector('input[type="file"]');

    // FormSubmit's honeypot field is `_gotcha`; the pages ship a `_honey` input.
    Array.prototype.forEach.call(form.querySelectorAll('[name="_honey"], [name="_gotcha"]'), function (input) {
      input.name = "_gotcha";
      input.value = "";
      input.setAttribute("tabindex", "-1");
      input.setAttribute("autocomplete", "off");
    });

    form.action = FORM_ENDPOINT;
    form.method = "POST";
    form.enctype = "multipart/form-data";

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // A double click must not send the same submission twice.
      if (form.getAttribute("data-sending") === "true") return;

      form.setAttribute("data-sending", "true");
      if (button) {
        button.disabled = true;
        button.innerHTML = hasFiles ? "Preparing…" : "Sending…";
      }
      say(status, hasFiles ? "Preparing your files…" : "Sending your message…", "#0a5f59");

      prepareFormData(form)
        .then(function (data) {
          var bytes = formDataBytes(data);
          if (bytes > MAX_UPLOAD_BYTES) {
            throw {
              local: true,
              message:
                "Those attachments come to " +
                Math.max(1, Math.round(bytes / (1024 * 1024))) +
                " MB and the form accepts about 4 MB in one request. Please send fewer or smaller files, " +
                "or email them to s.lakhani1@aim.com."
            };
          }
          if (button) button.innerHTML = hasFiles ? "Uploading…" : "Sending…";
          say(status, hasFiles ? "Uploading your files…" : "Sending your message…", "#0a5f59");
          return fetch(FORM_ENDPOINT, {
            method: "POST",
            body: data,
            headers: { Accept: "application/json" }
          });
        })
        .then(function (response) {
          return response.json().catch(function () {
            return null;
          });
        })
        .then(function (result) {
          form.removeAttribute("data-sending");
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
          if (result && result.ok) {
            form.reset();
            say(status, successMessage, "#0a5f59");
            return;
          }
          say(status, describeFailure(result), "#b3261e");
        })
        .catch(function (error) {
          // The request never completed (offline, blocked, or a browser
          // extension), or the files were still too big. Say so rather than
          // pretending it was delivered.
          form.removeAttribute("data-sending");
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
          if (error && error.local) {
            say(status, error.message, "#b3261e");
            return;
          }
          say(status, failureMessage, "#b3261e");
        });
    });
  });
})();
