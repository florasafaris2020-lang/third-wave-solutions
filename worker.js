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
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#123} .card{border:1px solid #dce5e8;border-radius:12px;padding:1.4rem} .notice{background:#e8f6f2;padding:1rem;border-radius:8px} .error{background:#fff0f2;color:#8b1e3f;padding:1rem;border-radius:8px} table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:.65rem;border-bottom:1px solid #ddd;vertical-align:top} input,textarea{font:inherit;width:100%;box-sizing:border-box;padding:.6rem} .actions{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1rem} button,a.button{padding:.75rem 1rem;border:0;border-radius:8px;background:#0a5f59;color:white;font-weight:700;text-decoration:none;cursor:pointer} button.reject{background:#8b1e3f} small{color:#536b77}</style><body>${body}</body></html>`, { status, headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
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
  const p = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p)));
  return `${p}.${Array.from(sig, b => b.toString(16).padStart(2,'0')).join('')}`;
}
async function verifyToken(env, token) {
  if (!env.APP_SECRET || !token || token.length > 2048) return null;
  const [p, hex, extra] = token.split('.');
  if (!p || !hex || extra) return null;
  const sig = new Uint8Array((hex.match(/.{2}/g) || []).map(x => parseInt(x,16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(p))) return null;
  try {
    const normalized = p.replace(/-/g,'+').replace(/_/g,'/');
    const raw = atob(normalized + '='.repeat((4-normalized.length%4)%4));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    return payload.exp > Math.floor(Date.now()/1000) ? payload : null;
  } catch { return null; }
}
function basicAuth(request, env) {
  const expectedUser = env.ADMIN_USER;
  const expectedPass = env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const [user, ...passParts] = atob(header.slice(6)).split(':');
    const pass = passParts.join(':');
    return user === expectedUser && pass === expectedPass;
  } catch { return false; }
}
function unauthorized() {
  return new Response('Admin authentication required', {status:401,headers:{'www-authenticate':'Basic realm="Third Wave review", charset="UTF-8"','cache-control':'no-store'}});
}
function validText(value, max) { return String(value || '').trim().slice(0,max); }
async function parseSubmission(request) {
  const form = await request.formData();
  const get = name => validText(form.get(name), name === 'Notes' || name === 'Public description' ? 5000 : 300);
  const files = form.getAll('Documents').filter(value => value instanceof File && value.size > 0);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) throw new Error('Attachments must total 4 MB or less.');
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) throw new Error('Only PDF, JPEG, PNG, and WebP files are accepted.');
  }
  return {
    businessName: get('Business'), contactName: get('Name'), email: get('Email').toLowerCase(),
    phone: get('Phone'), location: get('Location'), askingPrice: get('Asking price'),
    notes: get('Notes'), publicDescription: get('Public description'), honeypot: get('_honey'),
    consent: form.get('Consent') === 'Agreed to be contacted', files,
  };
}
async function sendReviewEmail(env, record, reviewUrl) {
  if (!env.RESEND_API_KEY || !env.REVIEW_EMAIL || !env.EMAIL_FROM) throw new Error('Email configuration is incomplete (RESEND_API_KEY, REVIEW_EMAIL, EMAIL_FROM).');
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[env.REVIEW_EMAIL],subject:`Business proposal to review: ${record.business_name}`,html:`<p>A seller submitted a business for review.</p><p><strong>${esc(record.business_name)}</strong><br>${esc(record.contact_name)} · ${esc(record.email)}</p><p><a href="${esc(reviewUrl)}">Review, edit public listing details, then approve or reject</a></p><p>Opening the link does not approve the listing; confirmation is required.</p>`}),
  });
  if (!response.ok) throw new Error(`Review email service returned ${response.status}`);
}
async function saveUploads(env, id, files) {
  if (!files.length) return [];
  if (!env.BUSINESS_UPLOADS) throw new Error('Private R2 bucket BUSINESS_UPLOADS is not configured.');
  const saved = [];
  for (const file of files) {
    const key = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)}`;
    await env.BUSINESS_UPLOADS.put(key, await file.arrayBuffer(), {httpMetadata:{contentType:file.type}, customMetadata:{originalName:file.name}});
    saved.push({key, name:file.name, type:file.type, size:file.size});
  }
  return saved;
}
function githubHeaders(token) { return {accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','content-type':'application/json'}; }
async function githubRead(env, path) {
  const c=config(env);
  if (!c.owner || !c.repo || !c.token) throw new Error('GitHub configuration is missing.');
  const r=await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`,{headers:githubHeaders(c.token)});
  if (r.status===404) return {sha:null,items:[]};
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
  const f=await r.json();
  const binary=atob(f.content.replace(/\n/g,''));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const text=new TextDecoder().decode(bytes);
  let items=JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('Public listings JSON is not an array.');
  return {sha:f.sha,items};
}
async function publish(env, record, formValues) {
  const c=config(env);
  const listing={id:record.id,businessName:formValues.publicTitle,location:formValues.publicLocation,askingPrice:formValues.publicPrice,description:formValues.publicDescription,image:'assets/img/retail.jpg',status:'approved',publishedAt:new Date().toISOString()};
  for (let attempt=0;attempt<3;attempt++) {
    const current=await githubRead(env,PUBLIC_LISTINGS_PATH);
    const items=current.items.filter(item=>item.id!==record.id);
    items.unshift(listing);
    const text=JSON.stringify(items,null,2)+'\n';
    const body={message:`Publish approved listing: ${listing.businessName}`,content:btoa(String.fromCharCode(...new TextEncoder().encode(text))),branch:c.branch};
    if(current.sha) body.sha=current.sha;
    const r=await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${PUBLIC_LISTINGS_PATH}`,{method:'PUT',headers:githubHeaders(c.token),body:JSON.stringify(body)});
    if(r.ok) return await r.json();
    if(r.status!==409 && r.status!==422) throw new Error(`GitHub publish failed (${r.status}).`);
  }
  throw new Error('Could not publish due to concurrent updates; retry from admin.');
}
function reviewHtml(row, token) {
  const files=JSON.parse(row.uploads||'[]');
  const fileHtml=files.length?`<h2>Private attachments</h2><ul>${files.map(f=>`<li><a href="/review-file?id=${encodeURIComponent(row.id)}&token=${encodeURIComponent(token)}&key=${encodeURIComponent(f.key)}">${esc(f.name)}</a> (${Math.ceil(f.size/1024)} KB)</li>`).join('')}</ul><p><small>These files are private and are not published with the listing.</small></p>`:'<p>No attachments provided.</p>';
  return page('Review seller proposal',`<main class="card"><h1>Review seller proposal</h1><p>Review and edit the public-facing fields. Private notes and attachments will not be published.</p><table><tr><th>Business</th><td>${esc(row.business_name)}</td></tr><tr><th>Seller</th><td>${esc(row.contact_name)}</td></tr><tr><th>Email</th><td>${esc(row.email)}</td></tr><tr><th>Phone</th><td>${esc(row.phone)}</td></tr><tr><th>Location</th><td>${esc(row.location)}</td></tr><tr><th>Asking price</th><td>${esc(row.asking_price)}</td></tr><tr><th>Private seller notes</th><td>${esc(row.notes)}</td></tr></table>${fileHtml}<form method="post" action="/review"><input type="hidden" name="token" value="${esc(token)}"><label>Public listing title<input name="publicTitle" maxlength="120" required value="${esc(row.public_title||row.business_name)}"></label><label>Public location<input name="publicLocation" maxlength="120" value="${esc(row.location)}"></label><label>Public asking price<input name="publicPrice" maxlength="80" value="${esc(row.asking_price)}"></label><label>Public description<textarea name="publicDescription" maxlength="1200" rows="5" required>${esc(row.public_description||'')}</textarea></label><p><small>Only these fields and an image placeholder will be published. Verify the seller has consented to disclose listing details.</small></p><div class="actions"><button name="action" value="approve" onclick="return confirm('Approve and publish this listing to the live website?')">Approve &amp; publish</button><button class="reject" name="action" value="reject" onclick="return confirm('Reject this submission? It will not be published.')">Reject</button></div></form></main>`);
}
async function reviewAction(request, env) {
  const form=await request.formData();
  const token=String(form.get('token')||'');
  const action=String(form.get('action')||'');
  const payload=await verifyToken(env,token);
  if(!payload||payload.purpose!=='review') return page('Expired review link','<main class="card"><h1>Invalid or expired link</h1></main>',403);
  const row=await one(env,'SELECT * FROM businesses WHERE id=?',payload.id);
  if(!row||row.status!=='pending') return page('Already handled','<main class="card"><h1>This submission is no longer pending.</h1></main>',409);
  if(action==='reject') {
    await db(env,"UPDATE businesses SET status='rejected',updated_at=? WHERE id=? AND status='pending'",Date.now(),row.id);
    return page('Submission rejected','<main class="card"><h1>Rejected</h1><p>This proposal will not be published.</p><a href="/admin">Admin</a></main>');
  }
  if(action!=='approve') return page('Invalid action','<main class="card"><h1>Choose approve or reject.</h1></main>',400);
  const values={publicTitle:validText(form.get('publicTitle'),120),publicLocation:validText(form.get('publicLocation'),120),publicPrice:validText(form.get('publicPrice'),80),publicDescription:validText(form.get('publicDescription'),1200)};
  if(!values.publicTitle||!values.publicDescription) return page('Missing public listing details','<main class="card"><h1>Title and public description are required.</h1><a href="/review?token='+encodeURIComponent(token)+'">Return</a></main>',400);
  try {
    await publish(env,row,values);
    const result=await db(env,"UPDATE businesses SET status='approved',public_title=?,public_location=?,public_price=?,public_description=?,updated_at=?,approved_at=? WHERE id=? AND status='pending'",values.publicTitle,values.publicLocation,values.publicPrice,values.publicDescription,Date.now(),Date.now(),row.id);
    if(!result.success) throw new Error('Status update failed after publish; check admin and JSON for duplicate item.');
    return page('Published','<main class="card"><h1>Approved &amp; published ✓</h1><p>The listing was committed to the website repository. GitHub Pages will deploy the update automatically.</p><a href="/admin">Return to admin</a></main>');
  } catch(error) {
    return page('Publish failed',`<main class="card"><h1>Could not publish</h1><p class="error">${esc(error.message)}</p><p>The proposal remains pending; retry from this review link.</p></main>`,500);
  }
}
function adminPage(rows) {
  const body=rows.map(row=>`<tr><td>${esc(row.business_name)}</td><td>${esc(row.contact_name)}</td><td>${esc(row.email)}</td><td>${esc(row.status)}</td><td>${new Date(row.created_at).toISOString()}</td><td>${esc(row.id)}</td></tr>`).join('')||'<tr><td colspan="6">No submissions.</td></tr>';
  return page('Business submissions',`<main class="card"><h1>Business submissions</h1><p>Admin review is protected by HTTP Basic Auth. Open a pending submission through the emailed review link.</p><table><thead><tr><th>Business</th><th>Seller</th><th>Email</th><th>Status</th><th>Submitted</th><th>ID</th></tr></thead><tbody>${body}</tbody></table></main>`);
}

export default { async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/api/business-submit' && request.method==='POST') {
    try {
      const values=await parseSubmission(request);
      if(values.honeypot) return json({ok:true,message:'Submission received.'});
      if(!values.businessName||!values.contactName||!/^\S+@\S+\.\S+$/.test(values.email)||!values.phone||!values.consent) return json({error:'Please complete required fields and consent.'},400);
      const id=crypto.randomUUID(); const now=Date.now();
      const uploads=await saveUploads(env,id,values.files);
      const record={id,business_name:values.businessName,contact_name:values.contactName,email:values.email,phone:values.phone,location:values.location,asking_price:values.askingPrice,notes:values.notes,public_description:values.publicDescription,status:'pending',created_at:now,updated_at:now,uploads:JSON.stringify(uploads)};
      try {
        await db(env,'INSERT INTO businesses (id,business_name,contact_name,email,phone,location,asking_price,notes,public_description,status,created_at,updated_at,uploads) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',record.id,record.business_name,record.contact_name,record.email,record.phone,record.location,record.asking_price,record.notes,record.public_description,record.status,record.created_at,record.updated_at,record.uploads);
        const token=await createToken(env,{purpose:'review',id,exp:Math.floor(Date.now()/1000)+REVIEW_TTL});
        const reviewUrl=new URL('/review?token='+encodeURIComponent(token),url.origin).toString();
        await sendReviewEmail(env,record,reviewUrl);
      } catch(error) {
        await db(env,'DELETE FROM businesses WHERE id=? AND status=\'pending\'',id).catch(()=>{});
        if(env.BUSINESS_UPLOADS) for(const file of uploads) await env.BUSINESS_UPLOADS.delete(file.key).catch(()=>{});
        throw error;
      }
      return json({ok:true,message:'Thank you. Your proposal has been submitted for review.'});
    } catch(error) { return json({error:error.message||'Submission failed.'},400); }
  }
  if(url.pathname==='/review' && request.method==='GET') {
    const token=url.searchParams.get('token')||''; const payload=await verifyToken(env,token);
    if(!payload||payload.purpose!=='review') return page('Invalid review link','<main class="card"><h1>Invalid or expired review link</h1></main>',403);
    const row=await one(env,'SELECT * FROM businesses WHERE id=?',payload.id);
    if(!row||row.status!=='pending') return page('Submission handled','<main class="card"><h1>This submission is already handled.</h1></main>',409);
    return reviewHtml(row,token);
  }
  if(url.pathname==='/review' && request.method==='POST') return reviewAction(request,env);
  if(url.pathname==='/review-file' && request.method==='GET') {
    const token=url.searchParams.get('token')||'';const payload=await verifyToken(env,token);const id=url.searchParams.get('id');const key=url.searchParams.get('key');
    if(!payload||payload.id!==id||!env.BUSINESS_UPLOADS) return new Response('Forbidden',{status:403});
    const row=await one(env,'SELECT uploads FROM businesses WHERE id=?',id);const files=JSON.parse(row?.uploads||'[]');if(!files.some(f=>f.key===key)) return new Response('Not found',{status:404});
    const obj=await env.BUSINESS_UPLOADS.get(key);if(!obj)return new Response('Not found',{status:404});
    return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'application/octet-stream','content-disposition':`attachment; filename="${files.find(f=>f.key===key).name.replace(/["\\\r\n]/g,'_')}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(url.pathname==='/admin') {
    if(!basicAuth(request,env)) return new Response('Admin authentication required',{status:401,headers:{'www-authenticate':'Basic realm="Business review", charset="UTF-8"','cache-control':'no-store'}});
    const rows=await env.BUSINESSES.prepare('SELECT id,business_name,contact_name,email,status,created_at FROM businesses ORDER BY created_at DESC LIMIT 100').all();
    return adminPage(rows.results||[]);
  }
  if(url.pathname==='/data/businesses.json') return env.ASSETS.fetch(new Request(new URL('/data/businesses.json',url),request));
  if(url.pathname==='/index.html') return Response.redirect(new URL('/',url),301);
  const asset=await env.ASSETS.fetch(request);return asset;
} };
