const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function htmlResponse(title, body, status = 200) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: Arial, sans-serif; line-height: 1.5; padding: 2rem; max-width: 980px; margin: 0 auto; color: #123; }
      .card { border: 1px solid #dfe7eb; border-radius: 14px; padding: 1.25rem; background: #fff; box-shadow: 0 8px 24px rgba(17, 32, 46, 0.06); }
      .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
      button, .button { display: inline-block; text-decoration: none; border: none; border-radius: 10px; padding: 0.75rem 1rem; font-weight: 700; cursor: pointer; }
      .approve { background: #0a5f59; color: #fff; }
      .reject { background: #8b1e3f; color: #fff; }
      .secondary { background: #edf5f7; color: #183b4b; }
      .meta { color: #48657a; margin: 0.2rem 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
      th, td { text-align: left; padding: 0.7rem; border-bottom: 1px solid #e5edf1; vertical-align: top; }
      code { background: #f3f6f8; padding: 0.1rem 0.35rem; border-radius: 5px; }
      .alert { padding: 0.8rem 1rem; background: #eefaf8; border: 1px solid #bfe7df; border-radius: 10px; color: #0a5f59; margin-bottom: 1rem; }
      .error { background: #fff0f4; border-color: #efbfd1; color: #7c1f3d; }
      input, textarea { width: 100%; box-sizing: border-box; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`,
    {
      status,
      headers: HTML_HEADERS,
    }
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeBoolean(value) {
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === false || value === 'false' || value === '0' || value === 'no') return false;
  return false;
}

function readBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return request.json();
  }
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    return request.formData();
  }
  return Promise.resolve({});
}

function toFormObject(formData) {
  if (!formData || typeof formData.entries !== 'function') {
    return {};
  }

  const out = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      out[key] = {
        name: value.name,
        size: value.size,
        type: value.type,
      };
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

async function initDatabase(env) {
  if (!env.BUSINESSES) {
    return;
  }

  await env.BUSINESSES.prepare(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      business_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      location TEXT,
      asking_price TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      approved_at INTEGER,
      rejected_at INTEGER,
      metadata TEXT
    )
  `).run();
}

async function getRecord(env, id) {
  if (!env.BUSINESSES) {
    return null;
  }
  return env.BUSINESSES.prepare('SELECT * FROM businesses WHERE id = ?').bind(id).first();
}

async function listRecords(env, limit = 100) {
  if (!env.BUSINESSES) {
    return [];
  }
  const result = await env.BUSINESSES.prepare('SELECT * FROM businesses ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return result.results || [];
}

function buildReviewLink(request, token) {
  return new URL('/review', request.url).toString() + '?token=' + encodeURIComponent(token);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncode(value) {
  const encoded = typeof value === 'string' ? utf8ToBase64(value) : btoa(String.fromCharCode(...new Uint8Array(value)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function createSignedToken(env, payload) {
  const secret = env.APP_SECRET || 'dev-secret';
  const payloadJson = JSON.stringify(payload);
  const headerAndPayload = base64UrlEncode(payloadJson);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(headerAndPayload));
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${headerAndPayload}.${signatureHex}`;
}

async function verifySignedToken(env, token) {
  const secret = env.APP_SECRET || 'dev-secret';
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadPart, signatureHex] = parts;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const expectedSignature = new Uint8Array(
    signatureHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || []
  );

  const signatureOk = await crypto.subtle.verify(
    'HMAC',
    key,
    expectedSignature,
    new TextEncoder().encode(payloadPart)
  );

  if (!signatureOk) {
    return null;
  }

  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const payload = JSON.parse(decoded);
    if (!payload || !payload.id || !payload.action || !payload.exp) {
      return null;
    }
    if (Date.now() > Number(payload.exp) * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getGitHubConfig(env) {
  const repoValue = env.GITHUB_REPO || 'florasafaris2020-lang/third-wave-solutions';
  const [owner, repo] = repoValue.split('/');
  return {
    owner: owner || 'florasafaris2020-lang',
    repo: repo || 'third-wave-solutions',
    branch: env.GITHUB_BRANCH || 'main',
    token: env.GITHUB_TOKEN || '',
  };
}

async function getGitHubFileContent(env, path) {
  const config = getGitHubConfig(env);
  if (!config.token) {
    return null;
  }

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub lookup failed: ${response.status}`);
  }

  const file = await response.json();
  const decoded = atob(file.content.replace(/\n/g, ''));
  return { ...file, contentText: decoded };
}

async function writeGitHubFile(env, path, content, message, sha) {
  const config = getGitHubConfig(env);
  if (!config.token) {
    throw new Error('Missing GITHUB_TOKEN');
  }

  const requestBody = {
    message,
    content: utf8ToBase64(content),
    branch: config.branch,
  };

  if (sha) {
    requestBody.sha = sha;
  }

  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function publishApprovedBusiness(env, row) {
  const path = 'public/data/businesses.json';
  const listing = {
    id: row.id,
    businessName: row.business_name || 'Business listing',
    contactName: row.contact_name || 'Seller',
    email: row.email || '',
    phone: row.phone || '',
    location: row.location || 'Kenya',
    askingPrice: row.asking_price || 'Discussed',
    description: row.notes || 'Approved business listing.',
    status: 'approved',
    createdAt: row.created_at,
    approvedAt: Math.floor(Date.now() / 1000),
    image: 'assets/img/retail.jpg',
  };

  const file = await getGitHubFileContent(env, path);
  let items = [];
  if (file && file.contentText) {
    try {
      items = JSON.parse(file.contentText);
    } catch {
      items = [];
    }
  }

  const existingIndex = items.findIndex((item) => item.id === listing.id);
  if (existingIndex >= 0) {
    items[existingIndex] = listing;
  } else {
    items.unshift(listing);
  }

  const content = JSON.stringify(items, null, 2);
  const result = await writeGitHubFile(env, path, content, `Publish approved business: ${listing.businessName}`, file ? file.sha : null);
  return {
    ok: true,
    htmlUrl: result.content?.html_url || '',
    commitSha: result.commit?.sha || '',
  };
}

function renderReviewPage(record, token) {
  const payload = {
    id: record.id,
    businessName: record.business_name || 'Business submission',
    contactName: record.contact_name || '-',
    email: record.email || '-',
    phone: record.phone || '-',
    location: record.location || '-',
    askingPrice: record.asking_price || '-',
    notes: record.notes || '-',
  };

  const body = `
    <div class="card">
      <h1>Review seller submission</h1>
      <div class="alert">Review this submission before publishing it to the website.</div>
      <table>
        <tr><th>ID</th><td><code>${escapeHtml(payload.id)}</code></td></tr>
        <tr><th>Business name</th><td>${escapeHtml(payload.businessName)}</td></tr>
        <tr><th>Seller</th><td>${escapeHtml(payload.contactName)}</td></tr>
        <tr><th>Email</th><td>${escapeHtml(payload.email)}</td></tr>
        <tr><th>Phone</th><td>${escapeHtml(payload.phone)}</td></tr>
        <tr><th>Location</th><td>${escapeHtml(payload.location)}</td></tr>
        <tr><th>Asking price</th><td>${escapeHtml(payload.askingPrice)}</td></tr>
        <tr><th>Notes</th><td>${escapeHtml(payload.notes)}</td></tr>
      </table>

      <form method="POST" action="/review">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="action" value="approve">
        <div class="actions">
          <button class="approve" type="submit">Approve &amp; publish</button>
          <button class="reject" type="submit" formaction="/review" formmethod="POST">Reject</button>
        </div>
      </form>
    </div>
  `;

  return htmlResponse('Review seller submission', body);
}

function renderAdminPage(rows) {
  const rowsHtml = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.business_name || '—')}</td>
          <td>${escapeHtml(row.contact_name || '—')}</td>
          <td>${escapeHtml(row.email || '—')}</td>
          <td>${escapeHtml(row.status || 'pending')}</td>
          <td><code>${escapeHtml(row.id)}</code></td>
        </tr>
      `).join('')
    : '<tr><td colspan="5">No submissions yet.</td></tr>';

  const body = `
    <div class="card">
      <h1>Submission admin</h1>
      <p class="meta">Use this page as an admin fallback in case an email review link is lost.</p>
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Seller</th>
            <th>Email</th>
            <th>Status</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  return htmlResponse('Submission admin', body);
}

async function handleReviewSubmission(request, env) {
  const formData = await readBody(request);
  const values = toFormObject(formData instanceof FormData ? formData : {});
  const action = values.action || 'approve';
  const token = values.token || '';
  const verified = await verifySignedToken(env, token);

  if (!verified || !verified.id) {
    return htmlResponse('Invalid token', `<div class="card"><h1>Invalid or expired review link</h1><p>This approval link is no longer valid. Request a fresh review link.</p></div>`, 403);
  }

  const record = await getRecord(env, verified.id);
  if (!record) {
    return htmlResponse('Submission not found', `<div class="card"><h1>Submission not found</h1><p>The item was not found in the database.</p></div>`, 404);
  }

  if (action === 'reject') {
    await env.BUSINESSES.prepare(`
      UPDATE businesses
      SET status = 'rejected', updated_at = ?, rejected_at = ?
      WHERE id = ?
    `).bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), record.id).run();

    return htmlResponse('Submission rejected', `
      <div class="card">
        <h1>Submission rejected</h1>
        <div class="alert error">${escapeHtml(record.business_name || 'Business')} has been rejected and will not be published.</div>
        <p><a class="button secondary" href="/admin">Back to admin</a></p>
      </div>
    `);
  }

  const nextStatus = 'approved';
  const approvedAt = Math.floor(Date.now() / 1000);
  await env.BUSINESSES.prepare(`
    UPDATE businesses
    SET status = ?, updated_at = ?, approved_at = ?
    WHERE id = ?
  `).bind(nextStatus, approvedAt, approvedAt, record.id).run();

  try {
    const published = await publishApprovedBusiness(env, { ...record, status: nextStatus, approved_at: approvedAt, created_at: Number(record.created_at) });
    return htmlResponse('Submission approved and published', `
      <div class="card">
        <h1>Submission approved</h1>
        <div class="alert">The listing has been published to the website.</div>
        <p><strong>Business:</strong> ${escapeHtml(record.business_name || '—')}</p>
        <p><strong>GitHub commit:</strong> <code>${escapeHtml(published.commitSha || 'n/a')}</code></p>
        <p><a class="button approve" href="/admin">Back to admin</a></p>
      </div>
    `);
  } catch (error) {
    return htmlResponse('Approval saved, publish failed', `
      <div class="card">
        <h1>Approval saved</h1>
        <div class="alert error">The approval was saved, but publishing to GitHub failed: ${escapeHtml(error.message || 'unknown error')}</div>
        <p><a class="button secondary" href="/admin">Back to admin</a></p>
      </div>
    `, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/_init') {
      await initDatabase(env);
      return jsonResponse({ ok: true, message: 'Database initialised' });
    }

    if (url.pathname === '/admin') {
      const rows = await listRecords(env, 100);
      return renderAdminPage(rows);
    }

    if (url.pathname === '/review') {
      if (request.method === 'POST') {
        return handleReviewSubmission(request, env);
      }

      const token = url.searchParams.get('token') || '';
      if (!token) {
        return htmlResponse('Missing token', '<div class="card"><h1>Missing review token</h1><p>Open the review link from the email or the admin page.</p></div>', 400);
      }

      const verified = await verifySignedToken(env, token);
      if (!verified || !verified.id) {
        return htmlResponse('Invalid token', '<div class="card"><h1>Invalid or expired review token</h1><p>This link has expired or is invalid.</p></div>', 403);
      }

      const record = await getRecord(env, verified.id);
      if (!record) {
        return htmlResponse('Submission not found', '<div class="card"><h1>Submission not found</h1><p>The record could not be loaded.</p></div>', 404);
      }

      return renderReviewPage(record, token);
    }

    if (url.pathname === '/api/business-submit' && request.method === 'POST') {
      const body = await readBody(request);
      const values = body instanceof FormData ? toFormObject(body) : (body || {});
      const honey = String(values._honey || '').trim();

      if (honey) {
        return jsonResponse({ ok: false, error: 'Invalid submission' }, 400);
      }

      const businessName = String(values.Business || values.businessName || values.name || '').trim();
      const contactName = String(values.Name || values.contactName || '').trim();
      const email = String(values.Email || values.email || '').trim();
      const phone = String(values.Phone || values.phone || '').trim();
      const location = String(values.Location || values.location || '').trim();
      const askingPrice = String(values['Asking price'] || values.askingPrice || values.Price || '').trim();
      const notes = String(values.Notes || values.notes || values.Message || '').trim();
      const consent = normalizeBoolean(values.Consent || values.consent || values['Consent value']);

      if (!businessName || !contactName || !email || !phone || !consent) {
        return jsonResponse({ ok: false, error: 'Please complete the required business submission fields.' }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      const id = crypto.randomUUID ? crypto.randomUUID() : `biz-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const record = {
        id,
        business_name: businessName,
        contact_name: contactName,
        email,
        phone,
        location,
        asking_price: askingPrice,
        notes,
        status: 'pending',
        created_at: now,
        updated_at: now,
        metadata: JSON.stringify({ source: 'seller-form', consent, uploaded: values.Documents || null }),
      };

      await env.BUSINESSES.prepare(`
        INSERT INTO businesses (
          id, business_name, contact_name, email, phone, location, asking_price, notes, status, created_at, updated_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        record.id,
        record.business_name,
        record.contact_name,
        record.email,
        record.phone,
        record.location,
        record.asking_price,
        record.notes,
        record.status,
        record.created_at,
        record.updated_at,
        record.metadata
      ).run();

      const token = await createSignedToken(env, {
        id: record.id,
        action: 'review',
        exp: now + (7 * 24 * 60 * 60),
      });

      const reviewUrl = buildReviewLink(request, token);

      return jsonResponse({
        ok: true,
        id: record.id,
        reviewUrl,
        message: 'Your business has been submitted for review. Use the review URL to approve or reject it.',
      });
    }

    if (url.pathname === '/index.html') {
      return Response.redirect(new URL('/', url).toString(), 301);
    }

    if (url.pathname === '/data/businesses.json') {
      const fileContents = await getGitHubFileContent(env, 'public/data/businesses.json');
      const content = fileContents && fileContents.contentText ? fileContents.contentText : '[]';
      return new Response(content, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return asset;
    }

    const page404 = await env.ASSETS.fetch(new Request(new URL('/404.html', url).toString(), request));
    if (page404.ok) {
      return new Response(page404.body, { status: 404, headers: page404.headers });
    }

    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

