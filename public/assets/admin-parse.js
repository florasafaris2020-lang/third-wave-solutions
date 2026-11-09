/* Third Wave Solutions — paste adapter for the owner dashboard
 *
 * Load this BEFORE assets/admin.js.
 *
 * admin.js turns whatever is in #pasteInput into review-queue items and expects
 * either `Field: value` lines or JSON. A submission copied out of the FormSubmit
 * dashboard does not always look like that: a card usually copies as a label and
 * its value on separate lines, a table copies with tabs, and the JSON keeps the
 * answers inside a `data` wrapper.
 *
 * So this adapter runs first, on the same click: it works out which format was
 * pasted, drops FormSubmit's control fields (_subject, _gotcha, _ts…) and the
 * submission metadata (id, created_at…), and rewrites the textarea into plain
 * JSON that admin.js already understands. Nothing here publishes anything.
 */
(function () {
  "use strict";

  var META_KEYS = [
    "id", "formid", "submissionid", "createdat", "submittedat", "submitted", "received",
    "status", "ip", "ipaddress", "useragent", "pageurl", "referrer", "referer", "timezone",
    "files", "spam", "spamscore", "locked", "read", "starred", "ok", "message", "error"
  ];

  var KNOWN_LABELS = [
    "name", "yourname", "email", "emailaddress", "phone", "phonewhatsapp", "role",
    "business", "businessname", "businesstradingname", "tradingname", "title", "businesstype",
    "sector", "category", "location", "yearstrading", "staff", "numberofstaff", "employees",
    "premises", "rent", "lease", "monthlysales", "revenue", "monthlyrevenue", "turnover",
    "monthlyprofit", "monthlycashflow", "cashflow", "profit", "askingprice", "askprice", "price",
    "reasonforsale", "includedinsale", "krapin", "krapinstatus", "krastatus", "businesspermit",
    "licences", "licenses", "liabilities", "pendingdisputes", "recordsavailable",
    "businessdocuments", "businessphotos", "consent", "notes", "message", "subject",
    "aboutthebusiness", "summary", "description", "documents", "attachments"
  ];

  function normaliseKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  var META = META_KEYS.map(normaliseKey);
  var LABELS = KNOWN_LABELS.map(normaliseKey);

  function isMetaKey(key) {
    return META.indexOf(normaliseKey(key)) !== -1;
  }

  function isKnownLabel(text) {
    return LABELS.indexOf(normaliseKey(text)) !== -1;
  }

  function tryJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function splitLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/\u00a0/g, " ").replace(/\s+$/, "");
      });
  }

  // FormSubmit stores answers under data/fields/values — unwrap any of them.
  function unwrapSubmission(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    var wrappers = ["data", "fields", "values", "answers", "form_data", "formdata", "payload"];
    for (var i = 0; i < wrappers.length; i += 1) {
      var inner = value[wrappers[i]];
      if (inner && typeof inner === "object" && !Array.isArray(inner) && Object.keys(inner).length) {
        return inner;
      }
    }
    if (value.submission && typeof value.submission === "object") {
      return unwrapSubmission(value.submission);
    }
    return value;
  }

  function collectObjects(value, out) {
    out = out || [];
    if (!value) return out;
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        collectObjects(entry, out);
      });
      return out;
    }
    if (typeof value !== "object") return out;
    var listKeys = ["submissions", "items", "results", "rows", "entries"];
    for (var i = 0; i < listKeys.length; i += 1) {
      if (Array.isArray(value[listKeys[i]])) return collectObjects(value[listKeys[i]], out);
    }
    if (Array.isArray(value.data)) return collectObjects(value.data, out);
    if (value.submission && typeof value.submission === "object") {
      return collectObjects(value.submission, out);
    }
    out.push(value);
    return out;
  }

  function toFields(object) {
    var source = unwrapSubmission(object);
    var fields = {};
    Object.keys(source).forEach(function (key) {
      if (String(key).charAt(0) === "_") return;
      if (isMetaKey(key)) return;
      var value = source[key];
      if (Array.isArray(value)) {
        value = value
          .map(function (entry) {
            if (entry && typeof entry === "object") return entry.filename || entry.name || entry.url || "";
            return String(entry);
          })
          .filter(Boolean)
          .join(", ");
      } else if (value && typeof value === "object") {
        value = value.filename || value.name || value.url || JSON.stringify(value);
      }
      var text = String(value == null ? "" : value).trim();
      if (text) fields[String(key)] = text;
    });
    return fields;
  }

  // A table copied out of the dashboard arrives tab separated.
  function tabbedObjects(lines) {
    var rows = lines
      .filter(function (line) {
        return line.trim();
      })
      .map(function (line) {
        return line.split("\t").map(function (cell) {
          return cell.trim();
        });
      });
    if (!rows.length) return [];

    var headerLabels = rows[0].filter(function (cell) {
      return isKnownLabel(cell);
    }).length;

    // A header row of field names followed by one row per submission.
    if (rows.length > 1 && headerLabels >= 2) {
      var headers = rows[0];
      return rows.slice(1).map(function (cells) {
        var object = {};
        headers.forEach(function (header, index) {
          if (header) object[header] = cells[index] || "";
        });
        return object;
      });
    }

    // Otherwise one label<TAB>value pair per line.
    var pairs = {};
    var usable = 0;
    rows.forEach(function (cells) {
      if (cells.length >= 2 && cells[0]) {
        pairs[cells[0]] = cells.slice(1).join(" ");
        usable += 1;
      }
    });
    return usable >= 2 ? [pairs] : [];
  }

  function isCsvRow(line) {
    return !!line && line.indexOf(",") !== -1 && line.split(",").length >= 2 && !/:\s/.test(line.slice(0, 80));
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
    var lines = String(text)
      .split(/\r?\n/)
      .filter(function (line) {
        return line.trim();
      });
    if (lines.length < 2) return [];
    var headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(function (line) {
      var cells = splitCsvLine(line);
      var object = {};
      headers.forEach(function (header, index) {
        object[header] = cells[index] || "";
      });
      return object;
    });
  }

  // Label on one line, value on the next — what copying a submission card gives.
  function alternatingObjects(lines) {
    var clean = lines
      .map(function (line) {
        return line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim();
      })
      .filter(function (line) {
        return line;
      });

    var named = {};
    var recognised = 0;
    for (var i = 0; i + 1 < clean.length; i += 1) {
      var label = clean[i];
      var value = clean[i + 1];
      if (isKnownLabel(label) && !isKnownLabel(value)) {
        named[label.replace(/[:：]$/, "")] = value;
        recognised += 1;
        i += 1;
      }
    }
    if (recognised >= 2) return [named];

    // No label we recognise: pair the lines anyway, label then value.
    var pairs = {};
    for (var j = 0; j + 1 < clean.length; j += 2) {
      if (clean[j] && clean[j + 1]) pairs[clean[j].replace(/[:：]$/, "")] = clean[j + 1];
    }
    return Object.keys(pairs).length >= 2 ? [pairs] : [];
  }

  function linesToObject(text) {
    var object = {};
    splitLines(text).forEach(function (line) {
      var match = line.match(/^\s*([^:]{2,60}):\s*(.+)$/);
      if (match) object[match[1].trim()] = match[2].trim();
    });
    return object;
  }

  /* Turn any of the supported paste formats into an array of field objects.
   * Returns [] when nothing recognisable was pasted. */
  function parseSubmissions(text) {
    var raw = String(text || "").replace(/\u00a0/g, " ").trim();
    if (!raw) return [];

    var lines = splitLines(raw);
    var objects = [];

    // 1. JSON — one object, an array, or several objects pasted line by line.
    if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
      var parsed = tryJson(raw);
      if (parsed === null) {
        parsed = lines
          .map(tryJson)
          .filter(function (entry) {
            return entry;
          });
      }
      if (parsed) objects = collectObjects(parsed);
    }

    // 2. Tabs — a table copied out of the dashboard, or label<TAB>value.
    if (!objects.length && raw.indexOf("\t") !== -1) objects = tabbedObjects(lines);

    // 3. CSV with a header row.
    if (!objects.length && isCsvRow(lines[0])) objects = csvToObjects(raw);

    // 4. Field: value lines.
    if (!objects.length) {
      var colon = linesToObject(raw);
      if (Object.keys(colon).length >= 2) objects = [colon];
    }

    // 5. Label and value on separate lines.
    if (!objects.length) objects = alternatingObjects(lines);

    return objects
      .map(toFields)
      .filter(function (fields) {
        return Object.keys(fields).length > 0;
      });
  }

  /* Canonical text for admin.js: JSON of the field object(s). */
  function normaliseText(text) {
    var items = parseSubmissions(text);
    if (!items.length) return "";
    return JSON.stringify(items.length === 1 ? items[0] : items, null, 2);
  }

  function say(message) {
    var box = document.getElementById("adminStatus");
    if (!box) return;
    box.textContent = message;
    box.className = "admin-status show err";
  }

  function wire() {
    var button = document.getElementById("parseBtn");
    var area = document.getElementById("pasteInput");

    if (button && area) {
      // Registered before admin.js, so this runs first on the same click:
      // rewrite the textarea into JSON, or stop admin.js adding junk.
      button.addEventListener("click", function (event) {
        var raw = area.value;
        if (!String(raw || "").trim()) return;

        var normalised = normaliseText(raw);
        if (!normalised) {
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          event.preventDefault();
          say(
            "Nothing recognisable was pasted. In the form dashboard, open the submission and copy the " +
              "field names and their values — a label with the value on the next line, “Field: value”, " +
              "a table, or the JSON all work."
          );
          return;
        }
        area.value = normalised;
      });
    }

    var queue = document.getElementById("queueList");
    if (queue) {
      queue.addEventListener("click", function (event) {
        if (!event.target.getAttribute || !event.target.getAttribute("data-approve")) return;
        var panel = document.getElementById("appPanel");
        if (panel && panel.hidden) {
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          event.preventDefault();
          say(
            "Pasting and reviewing work without signing in, but publishing writes to your repository. " +
              "Paste your GitHub token in the sign-in box — this submission stays in the queue."
          );
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  // Exposed so the paste adapter can be tested without a browser.
  window.TWSAdminParse = parseSubmissions;
  window.TWSAdminNormalise = normaliseText;
})();
