const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const REVIEW_TTL = 7 * 24 * 60 * 60;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PUBLIC_LISTINGS_PATH = 'public/data/businesses.json';
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#123} .card{border:1px solid #dce5e8;border-radius:12px;padding:1.4rem;margin:1rem 0} .notice{background:#e8f6f2;padding:1rem;border-radius:8px} .error{background:#fff0f2;color:#8b1e3f;padding:1rem;border-radius:8px} table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:.65rem;border-bottom:1px solid #ddd;vertical-align:top} button,a.button{font:inherit;padding:.6rem .8rem;border:0;border-radius:7px;background:#0a5f59;color:white;font-weight:700;text-decoration:none;cursor:pointer} button.reject{background:#8b1e3f} .actions{display:flex;gap:.5rem;flex-wrap:wrap} small{color:#536b77} code{overflow-wrap:anywhere} .preview{border:1px solid #dce5e8;border-radius:10px;padding:1rem;margin:1rem 0;max-width:500px} .preview img{max-width:100%;max-height:220px;object-fit:cover;border-radius:8px} input,textarea{font:inherit;padding:.55rem;box-sizing:border-box;width:100%;margin:.25rem 0 .75rem} label{display:block;font-weight:600} .login{max-width:420px}</style><body>${body}</body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
function config(env) {
  const [owner, repo] = (env.GITHUB_REPO || '').split('/');
  return { owner, repo, branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN };
}
async function db(env, sql, ...values) {
  if (!env.BUSINESSES) throw new Error('D1 binding BUSINESSES is not configured');
  return env.BUSINESSES.prepare(sql).bind(...values).run();
}
async function one(env, sql, ...values) {
  if (!env.BUSINESSES) throw new Error('D1 binding BUSINESSES is not configured');
  return env.BUSINESSES.prepare(sql).bind(...values).first();
}
async function createToken(env, payload) {
  if (!env.APP_SECRET) throw new Error('APP_SECRET is not configured');
  const p = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p)));
  return `${p}.${Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')}`;
}
async function verifyToken(env, token) {
  if (!env.APP_SECRET || !token || token.length > 2048) return null;
  const [p, hex, extra] = token.split('.');
  if (!p || !hex || extra) return null;
  const sig = new Uint8Array((hex.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(p))) return null;
  try {
    const normalized = p.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
function basicCredentials(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const [username, ...rest] = atob(header.slice(6)).split(':');
    return { username, password: rest.join(':') };
  } catch { return null; }
}
function isAdmin(request, env) {
  const credentials = basicCredentials(request);
  return !!credentials && !!env.ADMIN_USER && !!env.ADMIN_PASSWORD && credentials.username === env.ADMIN_USER && credentials.password === env.ADMIN_PASSWORD;
}
function unauthorized() {
  return new Response('Admin authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Business review", charset="UTF-8"', 'cache-control': 'no-store' },
  });
}
function validText(value, max) { return String(value || '').trim().slice(0, max); }
async function parseSubmission(request) {
  const form = await request.formData();
  const get = name => validText(form.get(name), name === 'Notes' || name === 'Public description' ? 5000 : 300);
  const files = form.getAll('Documents').filter(value => value instanceof File && value.size > 0);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) throw new Error('Attachments must total 4 MB or less.');
  for (const file of files) if (!ALLOWED_TYPES.has(file.type)) throw new Error('Only PDF, JPEG, PNG, and WebP files are accepted.');
  return {
    businessName: get('Business'), contactName: get('Name'), email: get('Email').toLowerCase(),
    phone: get('Phone'), location: get('Location'), askingPrice: get('Asking price'),
    notes: get('Notes'), publicDescription: get('Public description'), honeypot: get('_honey'),
    consent: form.get('Consent') === 'Agreed to be contacted', files,
  };
}
async function sendReviewEmail(env, record, reviewUrl) {
  if (!env.RESEND_API_KEY || !env.REVIEW_EMAIL || !env.EMAIL_FROM) throw new Error('Email configuration is incomplete.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.REVIEW_EMAIL],
      subject: `Business proposal to review: ${record.business_name}`,
      html: `<p>A seller submitted a business for review.</p><p><strong>${esc(record.business_name)}</strong><br>${esc(record.contact_name)} · ${esc(record.email)}</p><p><a href="${esc(reviewUrl)}">Review submission</a></p><p>Opening the link does not approve it; use an explicit action on the review page.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Review email service returned ${response.status}`);
}
async function saveUploads(env, id, files) {
  if (!files.length) return [];
  if (!env.BUSINESS_UPLOADS) throw new Error('Private R2 bucket BUSINESS_UPLOADS is not configured.');
  const saved = [];
  for (const file of files) {
    const key = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`;
    await env.BUSINESS_UPLOADS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name } });
    saved.push({ key, name: file.name, type: file.type, size: file.size });
  }
  return saved;
}
function githubHeaders(token) { return { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' }; }
function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
async function githubRead(env, path = PUBLIC_LISTINGS_PATH) {
  const c = config(env);
  if (!c.owner || !c.repo || !c.token) throw new Error('GitHub configuration is missing.');
  const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`, { headers: githubHeaders(c.token) });
  if (r.status === 404) return { sha: null, items: [] };
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
  const f = await r.json();
  const binary = atob(f.content.replace(/\n/g, ''));
  const text = new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  const items = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('Public listings JSON is not an array.');
  return { sha: f.sha, items };
}
async function publish(env, row, imagePath = 'assets/img/retail.jpg') {
  const c = config(env);
  const listing = {
    id: row.id,
    businessName: row.public_title || row.business_name,
    location: row.public_location || row.location,
    askingPrice: row.public_price || row.asking_price,
    description: row.public_description,
    image: imagePath,
    status: 'approved',
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await githubRead(env);
    const items = current.items.filter(item => item.id !== row.id);
    items.unshift(listing);
    const body = { message: `Publish approved listing: ${listing.businessName}`, content: toBase64Utf8(JSON.stringify(items, null, 2) + '\n'), branch: c.branch };
    if (current.sha) body.sha = current.sha;
    const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${PUBLIC_LISTINGS_PATH}`, { method: 'PUT', headers: githubHeaders(c.token), body: JSON.stringify(body) });
    if (r.ok) return r.json();
    if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub publish failed (${r.status}).`);
  }
  throw new Error('Could not publish due to concurrent updates; retry from admin.');
}
function escapeAttr(s) { return esc(s).replace(/`/g, '&#96;'); }
function adminLoginPage(error = '') {
  return page('Admin login', `<main class="card login"><h1>Business review admin</h1>${error ? `<p class="error">${esc(error)}</p>` : ''}<form method="post" action="/admin-login"><label for="username">Username<input id="username" name="username" autocomplete="username" required></label><label for="password">Password<input id="password" name="password" type="password" autocomplete="current-password" required></label><div class="actions"><button type="submit">Sign in</button></div></form></main>`);
}
async function adminSessionToken(env, username) {
  return createToken(env, { purpose: 'admin-session', username, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 });
}
async function hasAdminSession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)tw_admin=([^;]+)/);
  if (match) {
    const payload = await verifyToken(env, decodeURIComponent(match[1]));
    if (payload && payload.purpose === 'admin-session' && payload.username === env.ADMIN_USER) return { payload, cookie: true };
  }
  if (isAdmin(request, env)) return { payload: { purpose: 'admin-session', username: env.ADMIN_USER }, cookie: false };
  return null;
}
function adminSessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `tw_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${8 * 60 * 60}${secure}`;
}
function clearAdminCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `tw_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
async function adminPage(env, rows, session) {
  const tableRows = [];
  for (const row of rows) {
    const token = await createToken(env, { purpose: 'admin-action', id: row.id, exp: Math.floor(Date.now() / 1000) + 15 * 60 });
    const photos = JSON.parse(row.uploads || '[]').filter(file => (file.type || '').startsWith('image/'));
    const preview = photos[0] ? `<img src="/admin-image?id=${encodeURIComponent(row.id)}&token=${encodeURIComponent(token)}&key=${encodeURIComponent(photos[0].key)}" alt="Private proposal image preview">` : '<small>No uploaded image</small>';
    const actions = row.status === 'pending'
      ? `<form method="post" action="/admin-action"><input type="hidden" name="id" value="${esc(row.id)}"><input type="hidden" name="csrf" value="${esc(token)}"><div class="actions"><button name="action" value="approve" onclick="return confirm('Approve and publish this business listing?')">Approve &amp; publish</button><button class="reject" name="action" value="reject" onclick="return confirm('Reject this submission?')">Reject</button></div></form>`
      : `<span>${esc(row.status)}</span>`;
    tableRows.push(`<tr><td><strong>${esc(row.business_name)}</strong><br><small>${esc(row.location)}</small></td><td>${esc(row.contact_name)}<br>${esc(row.email)}<br>${esc(row.phone)}</td><td>${preview}</td><td>${esc(row.status)}</td><td>${new Date(row.created_at).toISOString()}</td><td>${actions}</td></tr>`);
  }
  return page('Business submissions', `<main class="card"><div class="actions" style="justify-content:space-between"><h1>Business submissions</h1><form method="post" action="/admin-logout"><button class="reject">Sign out</button></form></div><p><a class="button" href="/admin/published">View published listings</a></p><p>Only public title, location, price, description, and approved image are published. Private notes and original files remain private.</p><table><thead><tr><th>Business</th><th>Seller</th><th>Image preview</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>${tableRows.join('') || '<tr><td colspan="6">No submissions.</td></tr>'}</tbody></table></main>`);
}
async function adminAction(request, env) {
  const session = await hasAdminSession(request, env);
  if (!session) return unauthorized();
  const form = await request.formData();
  const id = validText(form.get('id'), 80);
  const action = validText(form.get('action'), 20);
  const payload = await verifyToken(env, String(form.get('csrf') || ''));
  if (!payload || payload.purpose !== 'admin-action' || payload.id !== id) return page('Expired form', '<main class="card"><h1>Admin form expired</h1><p>Reload /admin and try again.</p></main>', 403);
  if (action !== 'approve' && action !== 'reject') return page('Invalid action', '<main class="card"><h1>Choose approve or reject.</h1></main>', 400);
  const row = await one(env, 'SELECT * FROM businesses WHERE id=?', id);
  if (!row || row.status !== 'pending') return page('Already handled', '<main class="card"><h1>This submission is not pending.</h1><a href="/admin">Return to admin</a></main>', 409);
  if (action === 'reject') {
    await db(env, "UPDATE businesses SET status='rejected',updated_at=? WHERE id=? AND status='pending'", Date.now(), id);
    return page('Submission rejected', `<main class="card"><h1>Rejected</h1><p>${esc(row.business_name)} will not be published.</p><a href="/admin">Return to admin</a></main>`);
  }
  const formValues = await request.formData();
  const image = formValues.get('approvedImage');
  let imagePath = 'assets/img/retail.jpg';
  if (image instanceof File && image.size > 0) {
    if (!image.type.startsWith('image/') || image.size > 2 * 1024 * 1024) return page('Invalid image', '<main class="card"><h1>Choose an image under 2 MB.</h1><a href="/admin">Return to admin</a></main>', 400);
    const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[image.type];
    if (!ext) return page('Invalid image', '<main class="card"><h1>Use a JPEG, PNG, or WebP image.</h1><a href="/admin">Return to admin</a></main>', 400);
    const path = `public/assets/img/approved-${row.id}.${ext}`;
    const c = config(env);
    const prior = await githubReadPath(env, path);
    const put = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`, { method:'PUT', headers:githubHeaders(c.token), body:JSON.stringify({message:`Add approved listing photo: ${row.business_name}`,content:await fileToBase64(image),branch:c.branch,...(prior.sha?{sha:prior.sha}:{})}) });
    if (!put.ok) return page('Image upload failed', `<main class="card"><h1>Could not upload image</h1><p class="error">GitHub returned ${put.status}.</p></main>`, 502);
    imagePath = `assets/img/approved-${row.id}.${ext}`;
  }
  try {
    await publish(env, row, imagePath);
    const updated = await db(env, "UPDATE businesses SET status='approved',updated_at=?,approved_at=? WHERE id=? AND status='pending'", Date.now(), Date.now(), id);
    if (!updated.success || updated.meta?.changes === 0) throw new Error('The publication was written, but the pending status could not be updated. Check JSON before retrying.');
    return page('Published', `<main class="card"><h1>Approved &amp; published ✓</h1><p>${esc(row.business_name)} was added to the public listings JSON.</p><a href="/admin/published">Verify published listings</a></main>`);
  } catch (error) {
    return page('Publish failed', `<main class="card"><h1>Could not publish</h1><p class="error">${esc(error.message || 'Unknown error')}</p><a href="/admin">Return to admin</a></main>`, 500);
  }
}
async function githubReadPath(env, path) {
  const c = config(env);
  const response = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`, { headers: githubHeaders(c.token) });
  if (response.status === 404) return { sha: null };
  if (!response.ok) throw new Error(`GitHub image lookup failed (${response.status}).`);
  const file = await response.json();
  return { sha: file.sha };
}
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/admin/login' && request.method === 'GET') return page('Admin login', `<main class="card login"><h1>Business review admin</h1><form method="post" action="/admin/login"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form></main>`);
  if (url.pathname === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    const username = String(form.get('username') || '');
    const password = String(form.get('password') || '');
    if (!env.ADMIN_USER || !env.ADMIN_PASSWORD || username !== env.ADMIN_USER || password !== env.ADMIN_PASSWORD) return page('Admin login', '<main class="card"><h1>Sign in failed</h1><p class="error">Check username and password.</p><a href="/admin/login">Try again</a></main>', 401);
    const token = await createToken(env, { purpose:'admin-session', username, exp:Math.floor(Date.now()/1000)+8*60*60 });
    return new Response('', { status:303, headers:{location:'/admin', 'set-cookie':`tw_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`, 'cache-control':'no-store'} });
  }
  if (url.pathname === '/admin/logout' && request.method === 'POST') return new Response('', {status:303,headers:{location:'/admin/login','set-cookie':'tw_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0','cache-control':'no-store'}});
  if (url.pathname === '/admin/published' && request.method === 'GET') {
    const session = await hasAdminSession(request, env); if (!session) return Response.redirect(new URL('/admin/login', url), 303);
    const current = await githubRead(env); const cards = current.items.filter(item => item.status === 'approved').map(item => `<article class="preview"><img src="/${esc(item.image || 'assets/img/retail.jpg')}" alt=""><h2>${esc(item.businessName)}</h2><p>${esc(item.location)}</p><strong>${esc(item.askingPrice)}</strong><p>${esc(item.description)}</p></article>`).join('');
    return page('Published listings', `<main class="card"><h1>Published listings</h1><p><a href="/admin">Back to review</a></p>${cards || '<p>No approved listings published yet.</p>'}</main>`);
  }
  if (url.pathname === '/admin' && request.method === 'GET') {
    const session = await hasAdminSession(request, env); if (!session) return Response.redirect(new URL('/admin/login', url), 303);
    const result = await env.BUSINESSES.prepare('SELECT id,business_name,contact_name,email,phone,location,asking_price,public_title,public_location,public_price,public_description,status,created_at,uploads FROM businesses ORDER BY created_at DESC LIMIT 100').all();
    return adminPage(env, result.results || [], session);
  }
  if (url.pathname === '/admin-action' && request.method === 'POST') return adminAction(request, env);
  if (url.pathname === '/api/business-submit' && request.method === 'POST') {
    try {
      const values = await parseSubmission(request);
      if (values.honeypot) return json({ ok:true, message:'Submission received.' });
      if (!values.businessName || !values.contactName || !/^\S+@\S+\.\S+$/.test(values.email) || !values.phone || !values.consent) return json({error:'Please complete required fields and consent.'},400);
      const id=crypto.randomUUID(), now=Date.now(), uploads=await saveUploads(env,id,values.files);
      const record={id,business_name:values.businessName,contact_name:values.contactName,email:values.email,phone:values.phone,location:values.location,asking_price:values.askingPrice,notes:values.notes,public_description:values.publicDescription,status:'pending',created_at:now,updated_at:now,uploads:JSON.stringify(uploads)};
      try {
        await db(env,'INSERT INTO businesses (id,business_name,contact_name,email,phone,location,asking_price,notes,public_description,status,created_at,updated_at,uploads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',record.id,record.business_name,record.contact_name,record.email,record.phone,record.location,record.asking_price,record.notes,record.public_description,record.status,record.created_at,record.updated_at,record.uploads);
        const token=await createToken(env,{purpose:'review',id,exp:Math.floor(Date.now()/1000)+REVIEW_TTL});
        await sendReviewEmail(env,record,new URL('/review?token='+encodeURIComponent(token),url.origin).toString());
      } catch(error) {
        await db(env,'DELETE FROM businesses WHERE id=? AND status=\'pending\'',id).catch(()=>{});
        if(env.BUSINESS_UPLOADS) for(const file of uploads) await env.BUSINESS_UPLOADS.delete(file.key).catch(()=>{});
        throw error;
      }
      return json({ok:true,message:'Thank you. Your proposal has been submitted for review.'});
    } catch(error) { return json({error:error.message||'Submission failed.'},400); }
  }
  if (url.pathname === '/review' && request.method === 'GET') {
    const payload=await verifyToken(env,url.searchParams.get('token')||'');
    if(!payload||payload.purpose!=='review') return page('Invalid review link','<main class="card"><h1>Invalid or expired review link</h1></main>',403);
    const row=await one(env,'SELECT * FROM businesses WHERE id=?',payload.id);
    if(!row||row.status!=='pending') return page('Submission handled','<main class="card"><h1>This submission is already handled.</h1></main>',409);
    return page('Review seller proposal',`<main class="card"><h1>Proposal pending review</h1><p>${esc(row.business_name)} has been submitted.</p><a href="/admin/login">Open admin review</a></main>`);
  }
  if (url.pathname === '/review-file' && request.method === 'GET') {
    const payload=await verifyToken(env,url.searchParams.get('token')||''), id=url.searchParams.get('id'), key=url.searchParams.get('key');
    if(!payload||payload.id!==id||!env.BUSINESS_UPLOADS) return new Response('Forbidden',{status:403});
    const row=await one(env,'SELECT uploads FROM businesses WHERE id=?',id), files=JSON.parse(row?.uploads||'[]'), file=files.find(item=>item.key===key);
    if(!file) return new Response('Not found',{status:404});
    const object=await env.BUSINESS_UPLOADS.get(key); if(!object) return new Response('Not found',{status:404});
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','content-disposition':`attachment; filename="${file.name.replace(/["\\\r\n]/g,'_')}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if (url.pathname === '/admin-image' && request.method === 'GET') {
    const session=await hasAdminSession(request,env); if(!session) return new Response('Forbidden',{status:403});
    const id=url.searchParams.get('id'), key=url.searchParams.get('key'); const row=await one(env,'SELECT uploads FROM businesses WHERE id=?',id); const files=JSON.parse(row?.uploads||'[]'); const file=files.find(item=>item.key===key&&(item.type||'').startsWith('image/'));
    if(!file||!env.BUSINESS_UPLOADS) return new Response('Not found',{status:404}); const object=await env.BUSINESS_UPLOADS.get(key); if(!object)return new Response('Not found',{status:404});
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||file.type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if (url.pathname === '/data/businesses.json') return env.ASSETS.fetch(new Request(new URL('/data/businesses.json',url),request));
  if (url.pathname === '/index.html') return Response.redirect(new URL('/',url).toString(),301);
  return env.ASSETS.fetch(request);
} };
