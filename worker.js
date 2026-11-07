/* Third Wave Solutions — Cloudflare Worker
 *
 * Flow:
 *   POST /api/business-submit   multipart form + private R2 uploads -> D1 pending row
 *   GET  /review?token=...      signed review page emailed to the owner
 *   POST /review/action         approve (commit JSON to GitHub) or reject
 *   GET  /admin                 Basic Auth fallback list of submissions
 *   GET  /review/document       private document, only with a valid review token
 *   GET  /admin/document        private document for Basic Auth admins
 *
 * Approved listings are committed to public/data/businesses.json on the
 * configured branch. That push triggers the existing GitHub Pages workflow.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const SITE_ORIGIN = "https://florasafaris2020-lang.github.io";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin === SITE_ORIGIN ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request) },
  });
}

function htmlPage(title, body, status = 200) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Third Wave Solutions</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font:16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; background:#f6f3ee; color:#1d2b2a; }
  main { max-width:820px; margin:0 auto; padding:48px 20px 80px; }
  .card { background:#fff; border:1px solid #e2ddd4; border-radius:16px; padding:28px; box-shadow:0 10px 30px rgba(20,40,38,.06); }
  h1 { font-size:1.6rem; margin:0 0 .75rem; }
  h2 { font-size:1.1rem; margin:1.6rem 0 .5rem; }
  p { margin:.5rem 0; }
  a { color:#0a5f59; }
  .muted { color:#5d6b69; }
  .row { display:grid; gap:.5rem; grid-template-columns:150px 1fr; padding:.4rem 0; border-bottom:1px solid #f0ece5; }
  .row:last-child { border-bottom:0; }
  .label { color:#5d6b69; font-size:.9rem; }
  .actions { display:flex; gap:.75rem; flex-wrap:wrap; margin-top:1.2rem; }
  button { font:inherit; border:0; border-radius:10px; padding:.7rem 1.1rem; cursor:pointer; }
  .approve { background:#0a5f59; color:#fff; }
  .reject { background:#f1e6e3; color:#8a2f22; }
  textarea { width:100%; min-height:90px; margin-top:1rem; padding:.7rem; border:1px solid #d9d2c7; border-radius:10px; font:inherit; }
  ul { padding-left:1.2rem; }
  .badge { display:inline-block; padding:.2rem .6rem; border-radius:999px; background:#e7f2ef; color:#0a5f59; font-size:.8rem; }
  .error { color:#8a2f22; }
  table { border-collapse:collapse; width:100%; font-size:.92rem; margin-top:1rem; }
  th, td { text-align:left; padding:.6rem .5rem; border-bottom:1px solid #f0ece5; vertical-align:top; }
</style>
</head>
<body><main><div class="card">${body}</div></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(a, b) {
  const left = String(a == null ? "" : a);
  const right = String(b == null ? "" : b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function b64urlEncodeBytes(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlEncode(value) {
  return b64urlEncodeBytes(new TextEncoder().encode(String(value)));
}

function b64urlDecode(value) {
  const text = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function b64DecodeUtf8(value) {
  const bin = atob(String(value).replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncodeBytes(new Uint8Array(signature));
}

async function signToken(env, id) {
  if (!env.APP_SECRET) throw new Error("APP_SECRET is not configured");
  const payload = b64urlEncode(
    JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })
  );
  return `${payload}.${await hmac(env.APP_SECRET, payload)}`;
}

async function verifyToken(env, token) {
  if (!env.APP_SECRET || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = await hmac(env.APP_SECRET, payload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (!data || typeof data.id !== "string") return null;
    if (!Number.isFinite(data.exp) || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

function basicAuthOk(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return (
      safeEqual(decoded.slice(0, separator), env.ADMIN_USER) &&
      safeEqual(decoded.slice(separator + 1), env.ADMIN_PASSWORD)
    );
  } catch {
    return false;
  }
}

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Third Wave admin", charset="UTF-8"' },
  });
}

function getFormValue(form, ...names) {
  for (const name of names) {
    const value = form.get(name);
    if (value != null) return String(value).trim();
  }
  return "";
}

function safeFilename(name) {
  const base = String(name || "file").split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "file";
}

function parseDocuments(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((doc) => doc && doc.key) : [];
  } catch {
    return [];
  }
}

async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
    });
    if (!response.ok) {
      console.error("Resend error", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend request failed", error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* GitHub publish                                                      */
/* ------------------------------------------------------------------ */

async function commitApprovedListing(env, row) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  if (!repo || !env.GITHUB_TOKEN) {
    throw new Error("GITHUB_REPO or GITHUB_TOKEN is not configured");
  }

  const api = `https://api.github.com/repos/${repo}/contents/public/data/businesses.json`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "third-wave-solutions-worker",
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const read = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    let sha;
    let list = [];

    if (read.status === 404) {
      list = [];
    } else if (read.ok) {
      const data = await read.json();
      sha = data.sha;
      try {
        const parsed = JSON.parse(b64DecodeUtf8(data.content || ""));
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    } else {
      throw new Error(`GitHub read failed (${read.status})`);
    }

    const entry = {
      id: row.id,
      name: row.name,
      description: row.description || "",
      price: row.price || "",
      location: row.location || "",
      contact: row.contact || "",
      approved_at: Math.floor(Date.now() / 1000),
    };
    list = list.filter((item) => item && item.id !== entry.id);
    list.push(entry);

    const write = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: `Publish approved business: ${row.name}`,
        content: b64EncodeUtf8(JSON.stringify(list, null, 2) + "\n"),
        ...(sha ? { sha } : {}),
        branch,
      }),
    });

    if (write.ok) return write.json();
    if (write.status === 409 || write.status === 422) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      continue;
    }
    const detail = await write.text();
    throw new Error(`GitHub write failed (${write.status}): ${detail.slice(0, 300)}`);
  }

  throw new Error("GitHub write failed after retries");
}

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

async function handleBusinessSubmit(request, env, url) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_TOTAL_BYTES + 1024 * 1024) {
    return json({ error: "Upload is too large. Please keep files under 20 MB total." }, 413, request);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Could not read the form. Please try again." }, 400, request);
  }

  if (getFormValue(form, "_honey", "honey")) {
    return json({ ok: true }, 200, request);
  }

  const sellerName = getFormValue(form, "name", "Name");
  const businessName = getFormValue(form, "business", "Business");
  const phone = getFormValue(form, "contact", "Phone");
  const email = getFormValue(form, "email", "Email");
  const location = getFormValue(form, "location", "Location");
  const price = getFormValue(form, "price", "Asking price");
  const description = getFormValue(form, "description", "Notes");
  const consent = getFormValue(form, "consent", "Consent");

  if (!sellerName || !businessName || !phone || !email || !consent) {
    return json(
      { error: "Please complete your name, business name, phone, email and consent." },
      400,
      request
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400, request);
  }

  const files = form
    .getAll("documents")
    .filter(
      (value) =>
        value &&
        typeof value === "object" &&
        typeof value.arrayBuffer === "function" &&
        value.size > 0
    );

  if (files.length > MAX_FILES) {
    return json({ error: `Please upload at most ${MAX_FILES} files.` }, 400, request);
  }

  let total = 0;
  const accepted = [];
  for (const file of files) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const contentType = file.type || TYPE_BY_EXTENSION[extension];
    if (!ALLOWED_TYPES.has(contentType)) {
      return json(
        { error: `Unsupported file type: ${file.type || "unknown"}. Use PDF, JPG, PNG or WebP.` },
        400,
        request
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return json({ error: `${file.name} is larger than 8 MB.` }, 400, request);
    }
    total += file.size;
    if (total > MAX_TOTAL_BYTES) {
      return json({ error: "Uploads exceed 20 MB total." }, 400, request);
    }
    accepted.push({ file, contentType });
  }

  const id = crypto.randomUUID();
  const documents = [];
  for (let index = 0; index < accepted.length; index++) {
    const { file, contentType } = accepted[index];
    const key = `submissions/${id}/${index}-${safeFilename(file.name)}`;
    await env.BUSINESS_UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType },
    });
    documents.push({ key, name: file.name, size: file.size, type: contentType });
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.BUSINESSES.prepare(
      `INSERT INTO businesses
        (id, name, seller_name, description, price, location, contact, email, status, documents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
      .bind(
        id,
        businessName,
        sellerName,
        description,
        price,
        location,
        phone,
        email,
        JSON.stringify(documents),
        now
      )
      .run();
  } catch (error) {
    await Promise.all(documents.map((doc) => env.BUSINESS_UPLOADS.delete(doc.key).catch(() => {})));
    throw error;
  }

  if (env.REVIEW_EMAIL) {
    try {
      const token = await signToken(env, id);
      const reviewUrl = new URL(`/review?token=${encodeURIComponent(token)}`, url.origin).href;
      const docList = documents.length
        ? `<ul>${documents
            .map((doc) => `<li>${esc(doc.name)} (${Math.round(doc.size / 1024)} KB)</li>`)
            .join("")}</ul>`
        : "<p>No documents uploaded.</p>";

      await sendEmail(
        env,
        env.REVIEW_EMAIL,
        `New business submission: ${businessName}`,
        `<h2>New business submission</h2>
         <p><strong>${esc(businessName)}</strong> from ${esc(sellerName)}</p>
         <p><strong>Phone:</strong> ${esc(phone)}<br>
            <strong>Email:</strong> ${esc(email)}<br>
            <strong>Location:</strong> ${esc(location)}<br>
            <strong>Asking price:</strong> ${esc(price)}</p>
         <p>${esc(description).replace(/\n/g, "<br>")}</p>
         <h3>Documents</h3>${docList}
         <p><a href="${esc(reviewUrl)}">Review this submission</a></p>`
      );
    } catch (error) {
      console.error("Could not send review email", error);
    }
  }

  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) {
    return json({ ok: true, id }, 200, request);
  }

  return htmlPage(
    "Submission received",
    `<h1>Thank you — your details are with us.</h1>
     <p class="muted">Your business proposal has been submitted for review. We will email you at
     <strong>${esc(email)}</strong> once it has been reviewed.</p>
     <p><a href="${esc(SITE_ORIGIN)}/sell.html">Back to the seller page</a></p>`,
    200
  );
}

/* ------------------------------------------------------------------ */
/* Review links                                                        */
/* ------------------------------------------------------------------ */

async function handleReview(url, request, env) {
  const token = url.searchParams.get("token") || "";
  const data = await verifyToken(env, token);
  if (!data) {
    return htmlPage(
      "Link expired",
      `<h1>Review link not valid</h1>
       <p class="error">This link is invalid or has expired. Open the admin page to review submissions.</p>`,
      400
    );
  }

  const row = await env.BUSINESSES.prepare("SELECT * FROM businesses WHERE id = ?")
    .bind(data.id)
    .first();
  if (!row) {
    return htmlPage("Not found", "<h1>Submission not found</h1>", 404);
  }

  const documents = parseDocuments(row.documents);
  const docs = documents.length
    ? `<ul>${documents
        .map(
          (doc) =>
            `<li><a href="/review/document?key=${encodeURIComponent(doc.key)}&token=${encodeURIComponent(
              token
            )}">${esc(doc.name)}</a> <span class="muted">(${Math.round(
              (doc.size || 0) / 1024
            )} KB)</span></li>`
        )
        .join("")}</ul>`
    : `<p class="muted">No documents uploaded.</p>`;

  const actions =
    row.status === "pending"
      ? `<form method="POST" action="/review/action">
           <input type="hidden" name="token" value="${esc(token)}">
           <textarea name="reason" placeholder="Optional reason (shown to the seller if you reject)"></textarea>
           <div class="actions">
             <button class="approve" type="submit" name="action" value="approved">Approve &amp; publish</button>
             <button class="reject" type="submit" name="action" value="rejected">Reject</button>
           </div>
         </form>`
      : `<p class="muted">This submission was already reviewed (${esc(row.status)}).</p>`;

  return htmlPage(
    "Review submission",
    `<h1>${esc(row.name)}</h1>
     <p><span class="badge">${esc(row.status)}</span></p>
     <div class="row"><span class="label">Seller</span><span>${esc(row.seller_name || "—")}</span></div>
     <div class="row"><span class="label">Phone</span><span>${esc(row.contact || "—")}</span></div>
     <div class="row"><span class="label">Email</span><span>${esc(row.email || "—")}</span></div>
     <div class="row"><span class="label">Location</span><span>${esc(row.location || "—")}</span></div>
     <div class="row"><span class="label">Asking price</span><span>${esc(row.price || "—")}</span></div>
     <div class="row"><span class="label">Description</span><span>${esc(row.description || "—").replace(
       /\n/g,
       "<br>"
     )}</span></div>
     <h2>Supporting documents</h2>
     ${docs}
     <h2>Decision</h2>
     ${actions}`,
    200
  );
}

async function handleReviewAction(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return htmlPage("Bad request", '<p class="error">Could not read the form.</p>', 400);
  }

  const token = String(form.get("token") || "");
  const data = await verifyToken(env, token);
  if (!data) {
    return htmlPage("Link expired", "<h1>Review link not valid</h1>", 400);
  }

  const action = String(form.get("action") || "");
  if (action !== "approved" && action !== "rejected") {
    return htmlPage("Bad request", "<h1>Unknown action</h1>", 400);
  }

  const row = await env.BUSINESSES.prepare("SELECT * FROM businesses WHERE id = ?")
    .bind(data.id)
    .first();
  if (!row) return htmlPage("Not found", "<h1>Submission not found</h1>", 404);

  if (row.status !== "pending") {
    return htmlPage(
      "Already reviewed",
      `<h1>Already reviewed</h1><p>This submission is already <strong>${esc(row.status)}</strong>.</p>`,
      200
    );
  }

  const now = Math.floor(Date.now() / 1000);

  if (action === "approved") {
    try {
      await commitApprovedListing(env, row);
    } catch (error) {
      console.error("Publish failed", error);
      return htmlPage(
        "Publish failed",
        `<h1>Could not publish</h1>
         <p class="error">${esc(error.message)}</p>
         <p>The submission is still pending. Fix the GitHub settings and try again.</p>`,
        500
      );
    }

    await env.BUSINESSES.prepare(
      "UPDATE businesses SET status = 'approved', approved_at = ?, reviewed_at = ? WHERE id = ?"
    )
      .bind(now, now, row.id)
      .run();

    if (row.email) {
      await sendEmail(
        env,
        row.email,
        "Your Third Wave Solutions listing is live",
        `<h2>Your listing is approved</h2>
         <p>Hi ${esc(row.seller_name || "there")},</p>
         <p><strong>${esc(row.name)}</strong> has been approved and published on the Third Wave Solutions site.</p>
         <p><a href="${esc(SITE_ORIGIN)}/listings.html">View the listings page</a></p>`
      );
    }

    return htmlPage(
      "Published",
      `<h1>Approved and published</h1>
       <p><strong>${esc(row.name)}</strong> is now in <code>public/data/businesses.json</code>.
       The commit was pushed to <strong>${esc(env.GITHUB_BRANCH || "main")}</strong> and GitHub Pages will rebuild shortly.</p>
       <p><a href="${esc(SITE_ORIGIN)}/listings.html">Open the live listings page</a></p>`,
      200
    );
  }

  const reason = String(form.get("reason") || "").trim().slice(0, 1000);
  await env.BUSINESSES.prepare(
    "UPDATE businesses SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE id = ?"
  )
    .bind(reason, now, row.id)
    .run();

  if (row.email) {
    await sendEmail(
      env,
      row.email,
      "Update on your Third Wave Solutions submission",
      `<h2>Submission update</h2>
       <p>Hi ${esc(row.seller_name || "there")},</p>
       <p>Thank you for submitting <strong>${esc(row.name)}</strong>. After review, we are not able to publish it at this time.</p>
       ${reason ? `<p><strong>Note:</strong> ${esc(reason)}</p>` : ""}
       <p>You are welcome to submit again with more detail.</p>`
    );
  }

  return htmlPage(
    "Rejected",
    `<h1>Submission rejected</h1><p>The seller has been notified${reason ? " with your note" : ""}.</p>`,
    200
  );
}

/* ------------------------------------------------------------------ */
/* Admin fallback                                                      */
/* ------------------------------------------------------------------ */

async function handleAdmin(url, request, env) {
  if (!basicAuthOk(request, env)) return unauthorized();

  const result = await env.BUSINESSES.prepare(
    "SELECT * FROM businesses ORDER BY created_at DESC LIMIT 200"
  ).all();
  const rows = result.results || [];

  const body = rows.length
    ? rows
        .map((row) => {
          const documents = parseDocuments(row.documents);
          const docLinks = documents
            .map(
              (doc) =>
                `<a href="/admin/document?key=${encodeURIComponent(doc.key)}">${esc(doc.name)}</a>`
            )
            .join("<br>");
          const actions =
            row.status === "pending"
              ? `<form method="POST" action="/admin/action">
                   <input type="hidden" name="id" value="${esc(row.id)}">
                   <button class="approve" name="action" value="approved">Approve</button>
                   <button class="reject" name="action" value="rejected">Reject</button>
                 </form>`
              : "—";
          return `<tr>
            <td>${esc(row.name)}<br><span class="muted">${esc(row.seller_name || "")}</span></td>
            <td>${esc(row.status)}</td>
            <td>${esc(row.email || "")}<br>${esc(row.contact || "")}</td>
            <td>${docLinks || "—"}</td>
            <td>${actions}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="muted">No submissions yet.</td></tr>`;

  return htmlPage(
    "Admin",
    `<h1>Business submissions</h1>
     <p class="muted">Admin view. Email review links remain the usual workflow.</p>
     <table>
       <thead><tr><th>Business</th><th>Status</th><th>Contact</th><th>Documents</th><th>Action</th></tr></thead>
       <tbody>${body}</tbody>
     </table>`,
    200
  );
}

async function handleAdminAction(request, env) {
  if (!basicAuthOk(request, env)) return unauthorized();

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const id = String(form.get("id") || "");
  const action = String(form.get("action") || "");
  if (!id || (action !== "approved" && action !== "rejected")) {
    return new Response("Bad request", { status: 400 });
  }

  const row = await env.BUSINESSES.prepare("SELECT * FROM businesses WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return new Response("Not found", { status: 404 });
  if (row.status !== "pending") {
    return htmlPage(
      "Already reviewed",
      `<h1>Already reviewed</h1><p>This submission is already <strong>${esc(row.status)}</strong>.</p>`,
      200
    );
  }

  const now = Math.floor(Date.now() / 1000);

  if (action === "approved") {
    try {
      await commitApprovedListing(env, row);
    } catch (error) {
      return htmlPage(
        "Publish failed",
        `<h1>Could not publish</h1><p class="error">${esc(error.message)}</p>`,
        500
      );
    }
    await env.BUSINESSES.prepare(
      "UPDATE businesses SET status = 'approved', approved_at = ?, reviewed_at = ? WHERE id = ?"
    )
      .bind(now, now, id)
      .run();
    return htmlPage(
      "Published",
      `<h1>Approved</h1><p><strong>${esc(row.name)}</strong> was committed to GitHub.</p><p><a href="/admin">Back to admin</a></p>`,
      200
    );
  }

  await env.BUSINESSES.prepare(
    "UPDATE businesses SET status = 'rejected', reviewed_at = ? WHERE id = ?"
  )
    .bind(now, id)
    .run();
  return htmlPage(
    "Rejected",
    `<h1>Rejected</h1><p><a href="/admin">Back to admin</a></p>`,
    200
  );
}

/* ------------------------------------------------------------------ */
/* Private documents                                                   */
/* ------------------------------------------------------------------ */

async function handleDocument(url, request, env, mode) {
  const key = url.searchParams.get("key") || "";
  if (!key.startsWith("submissions/")) {
    return new Response("Not found", { status: 404 });
  }

  if (mode === "token") {
    const token = url.searchParams.get("token") || "";
    const data = await verifyToken(env, token);
    if (!data) return new Response("Forbidden", { status: 403 });

    const row = await env.BUSINESSES.prepare("SELECT documents FROM businesses WHERE id = ?")
      .bind(data.id)
      .first();
    const documents = parseDocuments(row && row.documents);
    if (!documents.some((doc) => doc.key === key)) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (!basicAuthOk(request, env)) {
    return unauthorized();
  }

  const object = await env.BUSINESS_UPLOADS.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true }, 200, request);
      }
      if (url.pathname === "/api/business-submit" && request.method === "POST") {
        return await handleBusinessSubmit(request, env, url);
      }
      if (url.pathname === "/review" && request.method === "GET") {
        return await handleReview(url, request, env);
      }
      if (url.pathname === "/review/action" && request.method === "POST") {
        return await handleReviewAction(request, env);
      }
      if (url.pathname === "/review/document" && request.method === "GET") {
        return await handleDocument(url, request, env, "token");
      }
      if (url.pathname === "/admin" && request.method === "GET") {
        return await handleAdmin(url, request, env);
      }
      if (url.pathname === "/admin/action" && request.method === "POST") {
        return await handleAdminAction(request, env);
      }
      if (url.pathname === "/admin/document" && request.method === "GET") {
        return await handleDocument(url, request, env, "admin");
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("Worker error", error);
      return new Response(`Server error: ${error.message}`, {
        status: 500,
        headers: corsHeaders(request),
      });
    }
  },
};
