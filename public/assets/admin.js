/* Third Wave Solutions — owner dashboard
 *
 * Sign in with a GitHub fine-grained token (Contents: Read and write on this
 * repository). Submissions are reviewed in the FormSubmit dashboard; approved
 * businesses are published here by writing public/data/listings.json through
 * the GitHub API. GitHub Pages then rebuilds the live site.
 */
(function () {
  "use strict";

  var OWNER = "florasafaris2020-lang";
  var REPO = "third-wave-solutions";
  var BRANCH = "main";
  var FILE = "public/data/listings.json";

  var TOKEN_KEY = "tws-admin-token";
  var DRAFT_KEY = "tws-admin-drafts";

  var state = {
    token: null,
    sha: null,
    doc: { version: 1, updated: "", listings: [] },
    listings: [],
    drafts: [],
    queue: [],
    editing: null
  };

  /* ---------------- helpers ---------------- */

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "listing";
  }

  function uniqueSlug(base) {
    var taken = state.listings
      .concat(state.drafts)
      .filter(function (l) {
        return l.slug !== (state.editing && state.editing.slug);
      })
      .map(function (l) {
        return l.slug;
      });
    var slug = base;
    var n = 2;
    while (taken.indexOf(slug) !== -1) {
      slug = base + "-" + n;
      n += 1;
    }
    return slug;
  }

  function toB64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromB64(encoded) {
    var binary = atob(String(encoded || "").replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function say(message, kind) {
    var box = $("adminStatus");
    if (!box) return;
    box.textContent = message;
    box.className = "admin-status show " + (kind || "busy");
  }

  function clearSay() {
    var box = $("adminStatus");
    if (box) box.className = "admin-status";
  }

  /* ---------------- token handling ---------------- */

  function readToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  }

  function storeToken(token, remember) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  }

  /* ---------------- GitHub API ---------------- */

  function api(path, options) {
    var opts = options || {};
    opts.headers = Object.assign(
      {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      opts.headers || {}
    );
    if (state.token) opts.headers.Authorization = "Bearer " + state.token;

    return fetch("https://api.github.com" + path, opts).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = { message: text };
        }
        if (!response.ok) {
          var err = new Error((data && data.message) || "GitHub returned HTTP " + response.status);
          err.status = response.status;
          throw err;
        }
        return data;
      });
    });
  }

  function loadFile() {
    return api("/repos/" + OWNER + "/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH).then(function (res) {
      state.sha = res.sha;
      var parsed = { version: 1, updated: today(), listings: [] };
      if (res.content) {
        try {
          parsed = JSON.parse(fromB64(res.content)) || parsed;
        } catch (error) {
          parsed = { version: 1, updated: today(), listings: [] };
        }
      }
      if (!Array.isArray(parsed.listings)) parsed.listings = [];
      state.doc = parsed;
      state.listings = parsed.listings;
      return state.listings;
    });
  }

  function saveFile(message, retry) {
    state.doc.version = state.doc.version || 1;
    state.doc.updated = today();
    state.doc.listings = state.listings;

    if (!state.doc.notice) {
      state.doc.notice =
        "Sample profiles are illustrative and are not offers for sale. Live listings are added from admin.html only after Third Wave Solutions has reviewed and approved the seller's submission.";
    }

    var body = {
      message: message,
      content: toB64(JSON.stringify(state.doc, null, 2) + "\n"),
      branch: BRANCH
    };
    if (state.sha) body.sha = state.sha;

    return api("/repos/" + OWNER + "/" + REPO + "/contents/" + FILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(function (error) {
      // A stale SHA (someone edited the file elsewhere) needs one refetch.
      if (!retry && (error.status === 409 || error.status === 422)) {
        return loadFile().then(function () {
          return saveFile(message, true);
        });
      }
      throw error;
    }).then(function (res) {
      state.sha = res.content.sha;
    });
  }

  /* ---------------- sign in / out ---------------- */

  function signIn(token, remember) {
    if (!token) {
      say("Paste your GitHub token first.", "err");
      return;
    }
    state.token = token.trim();
    say("Signing in…", "busy");

    api("/repos/" + OWNER + "/" + REPO)
      .then(function (repo) {
        if (!repo.permissions || !repo.permissions.push) {
          throw new Error(
            "That token can read the repository but not write to it. Give it Contents: Read and write."
          );
        }
        storeToken(state.token, remember);
        return loadFile();
      })
      .then(function () {
        state.drafts = readDrafts();
        showApp();
        say("Signed in as " + OWNER + ". Loaded " + state.listings.length + " listing(s).", "ok");
        renderListings();
        renderQueue();
      })
      .catch(function (error) {
        state.token = null;
        storeToken("", false);
        say(describeError(error), "err");
      });
  }

  function describeError(error) {
    if (error.status === 401) {
      return "GitHub rejected the token (401). It may be expired or mistyped — create a new one and try again.";
    }
    if (error.status === 404) {
      return "Not found (404). Check the token is for " + OWNER + "/" + REPO + " and can write Contents.";
    }
    if (error.status === 403) {
      return "GitHub refused the request (403). Check the token's permissions and any organisation restrictions.";
    }
    if (error.status === 409 || error.status === 422) {
      return "The file changed while saving. Reload the listings and try again.";
    }
    return error.message || "Something went wrong talking to GitHub.";
  }

  function showApp() {
    $("loginPanel").hidden = true;
    $("appPanel").hidden = false;
    $("signOutBtn").hidden = false;
    $("sessionLabel").textContent = "Signed in · " + OWNER + "/" + REPO;
  }

  function signOut() {
    state.token = null;
    state.sha = null;
    state.listings = [];
    state.drafts = [];
    state.queue = [];
    state.editing = null;
    storeToken("", false);
    $("loginPanel").hidden = false;
    $("appPanel").hidden = true;
    $("signOutBtn").hidden = true;
    $("sessionLabel").textContent = "Not signed in";
    $("listingForm").hidden = true;
    $("queueList").innerHTML = "";
    $("listingList").innerHTML = "";
    clearSay();
  }

  /* ---------------- local drafts ---------------- */

  function readDrafts() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeDrafts() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
  }

  /* ---------------- rendering ---------------- */

  function listingRow(listing, isDraft) {
    var tag = isDraft
      ? '<span class="tag tag--draft">Draft · this browser</span>'
      : listing.type === "sample" && (listing.status || "published") === "published"
        ? '<span class="tag tag--sample">Published · sample</span>'
        : (listing.status || "published") === "published"
          ? '<span class="tag tag--live">Published</span>'
          : '<span class="tag tag--draft">Unpublished</span>';

    return (
      '<div class="listing-row">' +
        "<div><strong>" + esc(listing.title || "Untitled") + "</strong>" +
        '<span class="admin-muted">' + esc(listing.location || "—") + " · " + esc(listing.ask || "No price") + "</span>" +
        "<br>" + tag + "</div>" +
        '<div class="row-actions">' +
          '<button class="btn btn--ghost btn--sm" data-edit="' + esc(listing.slug) + '" data-draft="' + (isDraft ? "1" : "0") + '">Edit</button>' +
          (isDraft
            ? '<button class="btn btn--ghost btn--sm" data-publish="' + esc(listing.slug) + '">Publish</button>' +
              '<button class="btn btn--danger btn--sm" data-draftdel="' + esc(listing.slug) + '">Delete</button>'
            : '<button class="btn btn--danger btn--sm" data-remove="' + esc(listing.slug) + '">Remove</button>') +
        "</div>" +
      "</div>"
    );
  }

  function renderListings() {
    var host = $("listingList");
    if (!host) return;
    var published = state.listings.map(function (listing) {
      return listingRow(listing, false);
    });
    var drafts = state.drafts.map(function (listing) {
      return listingRow(listing, true);
    });
    var html = published.join("");
    if (drafts.length) {
      html += "<h3>Private drafts</h3>" + drafts.join("");
    }
    host.innerHTML = html || '<p class="admin-muted">No listings yet. Approve a submission to create the first one.</p>';
  }

  function queueItemHTML(item, index) {
    var rows = Object.keys(item.fields)
      .slice(0, 14)
      .map(function (key) {
        return "<dt>" + esc(key) + "</dt><dd>" + esc(item.fields[key]) + "</dd>";
      })
      .join("");

    return (
      '<div class="queue-item">' +
        "<strong>" + esc(item.suggested.title || "Submission " + (index + 1)) + "</strong>" +
        "<dl>" + rows + "</dl>" +
        '<div class="row-actions">' +
          '<button class="btn btn--primary btn--sm" data-approve="' + index + '">Review &amp; approve</button>' +
          '<button class="btn btn--ghost btn--sm" data-dismiss="' + index + '">Dismiss</button>' +
        "</div>" +
      "</div>"
    );
  }

  function renderQueue() {
    var host = $("queueList");
    if (!host) return;
    if (!state.queue.length) {
      host.innerHTML =
        '<p class="admin-muted">Nothing in the review queue. Paste the details of a seller submission above, ' +
        "or open the FormSubmit dashboard to copy one.</p>";
      return;
    }
    host.innerHTML = state.queue.map(queueItemHTML).join("");
  }

  /* ---------------- submission parsing ---------------- */

  function normaliseKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function pick(fields, names) {
    var wanted = names.map(normaliseKey);
    var keys = Object.keys(fields);
    for (var i = 0; i < wanted.length; i += 1) {
      for (var j = 0; j < keys.length; j += 1) {
        if (normaliseKey(keys[j]) === wanted[i] && String(fields[keys[j]] || "").trim()) {
          return String(fields[keys[j]]).trim();
        }
      }
    }
    return "";
  }

  function splitCsvLine(line) {
    var out = [];
    var current = "";
    var quoted = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        out.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out.map(function (cell) {
      return cell.trim();
    });
  }

  function csvToObjects(text) {
    var lines = text.split(/\r?\n/).filter(function (line) {
      return line.trim();
    });
    if (lines.length < 2) return [];
    var headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(function (line) {
      var cells = splitCsvLine(line);
      var obj = {};
      headers.forEach(function (header, index) {
        obj[header] = cells[index] || "";
      });
      return obj;
    });
  }

  function linesToObject(text) {
    var obj = {};
    text.split(/\r?\n/).forEach(function (line) {
      var match = line.match(/^\s*([^:]{2,60}):\s*(.+)$/);
      if (match) obj[match[1].trim()] = match[2].trim();
    });
    return obj;
  }

  function parseSubmissions(text) {
    var raw = String(text || "").trim();
    if (!raw) return [];
    var objects = [];

    if (raw[0] === "[" || raw[0] === "{") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) objects = parsed;
        else if (Array.isArray(parsed.submissions)) objects = parsed.submissions;
        else if (parsed.fields) objects = [parsed.fields];
        else if (parsed.data && Array.isArray(parsed.data)) objects = parsed.data;
        else objects = [parsed];
      } catch (error) {
        objects = [];
      }
    }

    if (!objects.length && /,/.test(raw.split(/\r?\n/)[0]) && !/:\s/.test(raw.split(/\r?\n/)[0].slice(0, 80))) {
      objects = csvToObjects(raw);
    }

    if (!objects.length) {
      objects = [linesToObject(raw)];
    }

    return objects
      .map(function (object) {
        var fields = {};
        Object.keys(object || {}).forEach(function (key) {
          if (key === "_files") return;
          if (String(key).charAt(0) === "_") return;
          var value = object[key];
          fields[key] = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value == null ? "" : value);
        });
        if (!Object.keys(fields).length) return null;

        var suggested = {
          title: pick(fields, ["Business", "Business name", "Business trading name", "Trading name", "Title"]),
          category: pick(fields, ["Business type", "Sector", "Category"]),
          location: pick(fields, ["Location", "Where is the business", "Town"]),
          ask: pick(fields, ["Asking price", "Ask price", "Price"]),
          revenue: pick(fields, ["Monthly sales", "Revenue", "Monthly revenue", "Turnover"]),
          cashflow: pick(fields, ["Monthly profit", "Cash flow", "Monthly cash flow", "Profit"]),
          staff: pick(fields, ["Staff", "Number of staff", "Employees"]),
          lease: pick(fields, ["Lease", "Premises"]),
          summary: pick(fields, ["Notes", "About the business", "Summary", "Description"]),
          privateNotes:
            "Seller: " + (pick(fields, ["Name", "Your name"]) || "—") +
            " · Phone: " + (pick(fields, ["Phone", "Phone / WhatsApp"]) || "—") +
            " · Email: " + (pick(fields, ["Email", "Email address"]) || "—") +
            " · Reason for sale: " + (pick(fields, ["Reason for sale"]) || "—") +
            " · KRA: " + (pick(fields, ["KRA status", "KRA PIN status"]) || "—") +
            " · Licence status: " + (pick(fields, ["Licence status", "Licences", "Business permit"]) || "—") +
            " · Liabilities: " + (pick(fields, ["Liabilities", "Outstanding liabilities", "Loans"]) || "—")
        };

        return { fields: fields, suggested: suggested };
      })
      .filter(Boolean);
  }

  /* ---------------- editor ---------------- */

  function setForm(listing) {
    $("f-title").value = listing.title || "";
    $("f-category").value = listing.category || "";
    $("f-location").value = listing.location || "";
    $("f-ask").value = listing.ask || "";
    $("f-revenue").value = listing.revenue || "";
    $("f-cashflow").value = listing.cashflow || "";
    $("f-staff").value = listing.staff || "";
    $("f-lease").value = listing.lease || "";
    $("f-extra").value = listing.extra && listing.extra.label ? listing.extra.label + ": " + (listing.extra.value || "") : "";
    $("f-summary").value = listing.summary || "";
    $("f-image").value = listing.image || "";
    $("f-badge").value = listing.badge || "Approved listing";
    $("f-notes").value = listing.privateNotes || "";

    var checks = listing.checks || {};
    $("f-check-cashflow").value = checks.cashflow || "Pending";
    $("f-check-kra").value = checks.kra || "Pending";
    $("f-check-licences").value = checks.licences || "Pending";
    $("f-check-liabilities").value = checks.liabilities || "Pending";
  }

  function readForm() {
    var extraText = $("f-extra").value.trim();
    var extra = null;
    if (extraText) {
      var parts = extraText.split(":");
      extra = parts.length > 1
        ? { label: parts[0].trim(), value: parts.slice(1).join(":").trim() }
        : { label: "Other", value: extraText };
    }

    var title = $("f-title").value.trim();
    var editing = state.editing || {};

    return {
      slug: editing.slug || uniqueSlug(slugify(title)),
      title: title,
      category: $("f-category").value.trim(),
      location: $("f-location").value.trim(),
      ask: $("f-ask").value.trim(),
      revenue: $("f-revenue").value.trim(),
      cashflow: $("f-cashflow").value.trim(),
      staff: $("f-staff").value.trim(),
      lease: $("f-lease").value.trim(),
      extra: extra,
      summary: $("f-summary").value.trim(),
      image: $("f-image").value.trim() || "assets/img/office.jpg",
      badge: $("f-badge").value,
      type: editing.type || "live",
      page: editing.page || "",
      status: "published",
      checks: {
        cashflow: $("f-check-cashflow").value,
        kra: $("f-check-kra").value,
        licences: $("f-check-licences").value,
        liabilities: $("f-check-liabilities").value
      },
      published: editing.published || today(),
      privateNotes: $("f-notes").value.trim()
    };
  }

  function openEditor(listing) {
    state.editing = listing
      ? { slug: listing.slug, page: listing.page, type: listing.type, published: listing.published }
      : { slug: "", page: "", type: "live", published: today() };
    setForm(listing || { checks: {} });
    $("listingForm").hidden = false;
    $("editorHint").textContent = listing && listing.slug
      ? "Editing an existing listing. Publishing replaces it on the site."
      : "New listing. Set all four vetting checks before publishing.";
    if (window.matchMedia("(max-width: 940px)").matches) {
      $("editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function closeEditor() {
    state.editing = null;
    $("listingForm").hidden = true;
    $("editorHint").textContent = "Pick a queued submission or add a listing manually to start.";
  }

  function validationError(listing) {
    if (!listing.title) return "A public title is required.";
    var positive = {
      cashflow: /^(verified|yes|confirmed)/i,
      kra: /^(compliant|yes|confirmed)/i,
      licences: /^(current|yes|confirmed)/i,
      liabilities: /^(none|disclosed)/i
    };
    var labels = {
      cashflow: "Cash flow must be verified before publishing.",
      kra: "KRA must be recorded as compliant before publishing.",
      licences: "Licences must be recorded as current before publishing.",
      liabilities: "Liabilities must be checked (none found, or disclosed) before publishing."
    };
    var keys = Object.keys(positive);
    for (var i = 0; i < keys.length; i += 1) {
      if (!positive[keys[i]].test(String(listing.checks[keys[i]] || ""))) return labels[keys[i]];
    }
    if (!listing.summary) return "Add a short public summary — buyers need to know what the business does.";
    return "";
  }

  function publish(event) {
    if (event) event.preventDefault();
    if (!state.editing) return;

    var listing = readForm();
    var problem = validationError(listing);
    if (problem) {
      say(problem, "err");
      return;
    }

    var existing = state.listings.filter(function (item) {
      return item.slug === listing.slug;
    })[0];

    if (existing) {
      var index = state.listings.indexOf(existing);
      listing.page = existing.page || "";
      listing.type = existing.type || "live";
      listing.published = existing.published || today();
      state.listings[index] = listing;
    } else {
      state.listings.push(listing);
    }

    say("Publishing to GitHub…", "busy");
    saveFile("Publish listing: " + listing.title)
      .then(function () {
        state.drafts = state.drafts.filter(function (draft) {
          return draft.slug !== listing.slug;
        });
        writeDrafts();
        renderListings();
        closeEditor();
        say(
          'Published "' + listing.title + '". GitHub Pages rebuilds in about a minute — then it appears on the Businesses for sale page.',
          "ok"
        );
      })
      .catch(function (error) {
        // Roll the in-memory change back so the dashboard matches GitHub.
        state.listings = existing
          ? state.listings
          : state.listings.filter(function (item) {
              return item.slug !== listing.slug;
            });
        renderListings();
        say(describeError(error), "err");
      });
  }

  function saveDraft() {
    if (!state.editing) return;
    var listing = readForm();
    if (!listing.title) {
      say("Give the listing a title before saving a draft.", "err");
      return;
    }
    listing.status = "draft";
    var index = state.drafts.findIndex(function (draft) {
      return draft.slug === listing.slug;
    });
    if (index === -1) state.drafts.push(listing);
    else state.drafts[index] = listing;
    writeDrafts();
    renderListings();
    say("Draft saved in this browser only. Nothing has been published.", "ok");
  }

  function removeListing(slug) {
    var listing = state.listings.filter(function (item) {
      return item.slug === slug;
    })[0];
    if (!listing) return;
    if (!window.confirm('Remove "' + listing.title + '" from the website?')) return;

    state.listings = state.listings.filter(function (item) {
      return item.slug !== slug;
    });
    say("Removing from GitHub…", "busy");
    saveFile("Remove listing: " + listing.title)
      .then(function () {
        renderListings();
        say("Removed. The page updates in about a minute.", "ok");
      })
      .catch(function (error) {
        state.listings.push(listing);
        renderListings();
        say(describeError(error), "err");
      });
  }

  function publishDraft(slug) {
    var draft = state.drafts.filter(function (item) {
      return item.slug === slug;
    })[0];
    if (!draft) return;
    openEditor(draft);
    say('Draft loaded in the editor. Set the four vetting checks, then choose "Approve & publish".', "busy");
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    $("signInBtn").addEventListener("click", function () {
      signIn($("tokenInput").value, $("rememberInput").checked);
    });
    $("tokenInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        signIn($("tokenInput").value, $("rememberInput").checked);
      }
    });
    $("signOutBtn").addEventListener("click", signOut);

    $("parseBtn").addEventListener("click", function () {
      var items = parseSubmissions($("pasteInput").value);
      if (!items.length) {
        say("Nothing recognisable was pasted. Use the FormSubmit JSON/CSV export or 'Field: value' lines.", "err");
        return;
      }
      state.queue = state.queue.concat(items);
      renderQueue();
      $("pasteInput").value = "";
      say("Added " + items.length + " submission(s) to the review queue.", "ok");
    });

    $("clearQueueBtn").addEventListener("click", function () {
      state.queue = [];
      renderQueue();
      say("Review queue cleared. Nothing on the website was changed.", "ok");
    });

    $("newListingBtn").addEventListener("click", function () {
      openEditor(null);
    });

    $("reloadBtn").addEventListener("click", function () {
      say("Reloading from GitHub…", "busy");
      loadFile()
        .then(function () {
          renderListings();
          say("Reloaded " + state.listings.length + " listing(s) from GitHub.", "ok");
        })
        .catch(function (error) {
          say(describeError(error), "err");
        });
    });

    $("listingForm").addEventListener("submit", publish);
    $("draftBtn").addEventListener("click", saveDraft);
    $("cancelEditBtn").addEventListener("click", function () {
      closeEditor();
      clearSay();
    });

    $("queueList").addEventListener("click", function (event) {
      var approve = event.target.getAttribute("data-approve");
      var dismiss = event.target.getAttribute("data-dismiss");

      if (approve !== null) {
        var item = state.queue[Number(approve)];
        if (!item) return;
        openEditor({
          slug: "",
          title: item.suggested.title,
          category: item.suggested.category,
          location: item.suggested.location,
          ask: item.suggested.ask,
          revenue: item.suggested.revenue,
          cashflow: item.suggested.cashflow,
          staff: item.suggested.staff,
          lease: item.suggested.lease,
          summary: item.suggested.summary,
          privateNotes: item.suggested.privateNotes,
          image: "assets/img/office.jpg",
          badge: "Approved listing",
          type: "live",
          checks: {}
        });
        say("Submission loaded. Confirm the vetting outcome, edit the public wording, then publish.", "busy");
      }

      if (dismiss !== null) {
        state.queue.splice(Number(dismiss), 1);
        renderQueue();
      }
    });

    $("listingList").addEventListener("click", function (event) {
      var edit = event.target.getAttribute("data-edit");
      var isDraft = event.target.getAttribute("data-draft") === "1";
      var publishSlug = event.target.getAttribute("data-publish");
      var remove = event.target.getAttribute("data-remove");
      var draftDelete = event.target.getAttribute("data-draftdel");

      if (edit) {
        var source = isDraft ? state.drafts : state.listings;
        var listing = source.filter(function (item) {
          return item.slug === edit;
        })[0];
        if (listing) openEditor(listing);
      }
      if (publishSlug) publishDraft(publishSlug);
      if (remove) removeListing(remove);
      if (draftDelete) {
        state.drafts = state.drafts.filter(function (draft) {
          return draft.slug !== draftDelete;
        });
        writeDrafts();
        renderListings();
        say("Draft deleted from this browser.", "ok");
      }
    });
  }

  function start() {
    bind();
    var token = readToken();
    if (token) {
      $("tokenInput").value = token;
      $("rememberInput").checked = !!localStorage.getItem(TOKEN_KEY);
      signIn(token, $("rememberInput").checked);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
