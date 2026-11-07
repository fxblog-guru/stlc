// demo-app — the smallest product the golden specs run against, so the bundle proves its own kit
// in CI instead of shipping examples nobody has executed. It is shaped like the apps the kit must
// serve: a cookie session plus an X-CSRF-Token header on every non-GET, a global Owner and
// per-project roles (admin · member · viewer), problem+json errors, bounded lists, and a
// server-rendered UI with accessible markup. An OpenAPI document (openapi.yaml) describes the API.
// In-memory and single-process on purpose: `node server.mjs [port]`; state resets on restart.
//
// Seeded bugs — tests/golden/run.mjs starts the app with each one and proves the named spec goes red:
//   DEMO_BUG=<name>[,<name>…]
//     double-submit  the Create button stays enabled while its request is pending, and the name
//                    check races the insert → one double-click makes two projects with one name
//     stale-write    PATCH ignores If-Match → the second tab silently overwrites the first
//     fuzz-500       a whitespace-only name crashes create/update → 500
//     leak           the 400 for a non-object body carries the server's stack trace
//     member-count   re-granting a role to an existing member counts them again
//     silent-error   GET /projects logs an error but still answers 200
//   DEMO_LOG=<file>  append one JSON line per request and per error — the server log the kit's
//                    serverWatch fixture reads (QA_SERVER_LOG)
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const BUGS = new Set((process.env.DEMO_BUG ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const bug = (name) => BUGS.has(name);
const LOG = process.env.DEMO_LOG;
const log = (level, msg, extra = {}) => {
  if (LOG) appendFileSync(LOG, `${JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra })}\n`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Accounts: one Owner and a pool of plain users. The pool lets each Playwright worker sign in as
// its own accounts (TEST_POOL in qa/.env.*), so per-account state never crosses workers.
const users = new Map();
const addUser = (email, password, name, isOwner = false) =>
  users.set(email, { id: randomUUID(), email, password, name, isOwner });
addUser('owner@demo.test', 'owner-password', 'Olive Owner', true);
for (let i = 1; i <= 60; i++) {
  const n = String(i).padStart(3, '0');
  addUser(`user.${n}@demo.test`, `user-password-${n}`, `User ${n}`);
}
const byId = (id) => [...users.values()].find((u) => u.id === id);

const sessions = new Map(); // sid → { userId, csrf }
const projects = new Map(); // id → { id, name, description, createdAt, version, count, members: Map<userId, role> }
const ROLES = ['admin', 'member', 'viewer'];

function send(res, status, body, type = 'application/json') {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}
const problem = (res, status, type, detail, extra = {}) =>
  send(res, status, { type: `https://demo.test/problems/${type}`, title: type, status, detail, ...extra }, 'application/problem+json');
const html = (res, status, page) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
};

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]),
  );
}
function currentSession(req) {
  const sid = cookies(req).session;
  const s = sid && sessions.get(sid);
  return s ? { sid, ...s, user: byId(s.userId) } : undefined;
}
function csrfOk(req, s) {
  const got = Buffer.from(String(req.headers['x-csrf-token'] ?? ''));
  const want = Buffer.from(s.csrf);
  return got.length === want.length && timingSafeEqual(got, want);
}
const MALFORMED = Symbol('malformed');
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return MALFORMED; }
}
const isObject = (b) => typeof b === 'object' && b !== null && !Array.isArray(b);
const malformed = (res) =>
  problem(res, 400, 'malformed', 'Body is not a JSON object.', bug('leak') ? { stack: new TypeError('body is not an object').stack } : {});

const roleIn = (p, u) => (u.isOwner ? 'owner' : p.members.get(u.id));
const can = {
  write: (r) => ['owner', 'admin', 'member'].includes(r),
  admin: (r) => ['owner', 'admin'].includes(r),
};
const view = (p, viewer) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  created_at: p.createdAt,
  my_role: roleIn(p, viewer) ?? null,
  member_count: p.count,
});
const etag = (p) => `"v${p.version}"`;
const nameTaken = (name, exceptId) =>
  [...projects.values()].some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
const meView = (u) => ({ id: u.id, email: u.email, name: u.name, is_owner: u.isOwner });

function validateProject(body, partial) {
  const errors = [];
  if (!partial || 'name' in body) {
    if (typeof body.name !== 'string') errors.push({ field: 'name', code: 'required' });
    else if (bug('fuzz-500') && body.name.length > 0 && body.name.trim() === '') throw new TypeError("Cannot read properties of undefined (reading 'length')");
    else if (body.name.trim().length < 1 || body.name.length > 80) errors.push({ field: 'name', code: 'length' });
  }
  if ('description' in body && body.description !== null && (typeof body.description !== 'string' || body.description.length > 500))
    errors.push({ field: 'description', code: 'length' });
  for (const k of Object.keys(body)) if (!['name', 'description'].includes(k)) errors.push({ field: k, code: 'unknown' });
  return errors;
}

async function api(req, res, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  if (path === '/sign-in' && method === 'POST') {
    const body = await readJson(req);
    const u = isObject(body) && users.get(body.email);
    if (!u || u.password !== body.password) return problem(res, 401, 'sign-in-failed', 'E-mail or password is wrong.');
    const sid = randomBytes(24).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    sessions.set(sid, { userId: u.id, csrf });
    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly; SameSite=Lax`);
    return send(res, 200, { me: meView(u), csrf_token: csrf });
  }

  const s = currentSession(req);
  if (!s) return problem(res, 401, 'unauthenticated', 'Sign in first.');
  if (!['GET', 'HEAD'].includes(method) && !csrfOk(req, s)) return problem(res, 403, 'csrf', 'Missing or wrong X-CSRF-Token.');
  const me = s.user;

  if (path === '/me' && method === 'GET') return send(res, 200, { me: meView(me), csrf_token: s.csrf });
  if (path === '/sign-out' && method === 'POST') { sessions.delete(s.sid); return send(res, 204); }
  if (path === '/accounts' && method === 'GET') {
    const email = url.searchParams.get('email');
    const u = email && users.get(email);
    return u ? send(res, 200, { id: u.id, email: u.email, name: u.name }) : problem(res, 404, 'not-found', 'No such account.');
  }

  if (path === '/projects' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const limit = Number(url.searchParams.get('limit') ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      return problem(res, 422, 'validation', 'limit is 1..100', { errors: [{ field: 'limit', code: 'range' }] });
    if (bug('silent-error')) log('error', 'projects: search index refresh failed', { err: 'ECONNRESET' });
    const visible = [...projects.values()]
      .filter((p) => roleIn(p, me) && p.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return send(res, 200, { items: visible.slice(0, limit).map((p) => view(p, me)), total: visible.length });
  }
  if (path === '/projects' && method === 'POST') {
    if (!me.isOwner) return problem(res, 403, 'forbidden', 'Only the Owner creates projects.');
    const body = await readJson(req);
    if (!isObject(body)) return malformed(res);
    const errors = validateProject(body, false);
    if (errors.length) return problem(res, 422, 'validation', 'The project is not valid.', { errors });
    const name = body.name.trim();
    if (nameTaken(name)) return problem(res, 409, 'name-taken', `A project named "${name}" exists.`);
    if (bug('double-submit')) await pause(150); // the seeded race: check, wait on "the database", then insert
    const p = { id: randomUUID(), name, description: body.description ?? null, createdAt: new Date().toISOString(), version: 1, count: 0, members: new Map() };
    projects.set(p.id, p);
    res.setHeader('Location', `/api/projects/${p.id}`);
    return send(res, 201, view(p, me));
  }

  let m = path.match(/^\/projects\/([^/]+)$/);
  if (m) {
    const p = projects.get(m[1]);
    const role = p && roleIn(p, me);
    if (!p || !role) return problem(res, 404, 'not-found', 'No such project.'); // a non-member cannot learn it exists
    if (method === 'GET') {
      res.setHeader('ETag', etag(p));
      return send(res, 200, view(p, me));
    }
    if (method === 'PATCH') {
      if (!can.write(role)) return problem(res, 403, 'forbidden', 'Viewers cannot edit.');
      // Optimistic concurrency: a client that sends the ETag it read gets 409 when someone else saved since.
      const ifMatch = req.headers['if-match'];
      if (ifMatch && ifMatch !== etag(p) && !bug('stale-write'))
        return problem(res, 409, 'stale', 'Someone else changed this project. Reload to see their changes.');
      const body = await readJson(req);
      if (!isObject(body)) return malformed(res);
      const errors = validateProject(body, true);
      if (errors.length) return problem(res, 422, 'validation', 'The project is not valid.', { errors });
      if ('name' in body && nameTaken(body.name.trim(), p.id))
        return problem(res, 409, 'name-taken', `A project named "${body.name.trim()}" exists.`);
      if ('name' in body) p.name = body.name.trim();
      if ('description' in body) p.description = body.description;
      p.version += 1;
      res.setHeader('ETag', etag(p));
      return send(res, 200, view(p, me));
    }
    if (method === 'DELETE') {
      if (!can.admin(role)) return problem(res, 403, 'forbidden', 'Only an admin deletes a project.');
      projects.delete(p.id);
      return send(res, 204);
    }
  }

  m = path.match(/^\/projects\/([^/]+)\/members\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const p = projects.get(m[1]);
    const role = p && roleIn(p, me);
    if (!p || !role) return problem(res, 404, 'not-found', 'No such project.');
    if (!can.admin(role)) return problem(res, 403, 'forbidden', 'Only an admin manages members.');
    const target = byId(m[2]);
    if (!target || !p.members.has(target.id)) return problem(res, 404, 'not-found', 'Not a member.');
    p.members.delete(target.id);
    p.count -= 1;
    return send(res, 204);
  }
  if (m && method === 'PUT') {
    const p = projects.get(m[1]);
    const role = p && roleIn(p, me);
    if (!p || !role) return problem(res, 404, 'not-found', 'No such project.');
    if (!can.admin(role)) return problem(res, 403, 'forbidden', 'Only an admin manages members.');
    const target = byId(m[2]);
    if (!target) return problem(res, 404, 'not-found', 'No such account.');
    const body = await readJson(req);
    if (!isObject(body) || !ROLES.includes(body.role))
      return problem(res, 422, 'validation', 'role is admin | member | viewer', { errors: [{ field: 'role', code: 'enum' }] });
    if (!p.members.has(target.id) || bug('member-count')) p.count += 1; // the seeded bug counts a re-grant again
    p.members.set(target.id, body.role);
    return send(res, 200, { account_id: target.id, role: body.role });
  }

  return problem(res, 404, 'not-found', `No route ${method} ${path}.`);
}

// ── UI: server-rendered pages with semantic markup; a little JS posts the forms ────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STYLE = `body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#1a1a1a;background:#fff}
header,main{padding:16px 24px}header{display:flex;gap:16px;align-items:center;border-bottom:1px solid #767676}
a{color:#1d4ed8}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}
button,input,textarea{font:inherit}button{padding:6px 14px;background:#1d4ed8;color:#fff;border:0;border-radius:4px;cursor:pointer}
label{display:block;margin-top:12px}input,textarea{display:block;width:100%;max-width:420px;padding:6px;border:1px solid #555;border-radius:4px}
[role=alert]{color:#a40000;min-height:1.5em}dialog{border:1px solid #555;border-radius:6px}
td{overflow-wrap:anywhere}input,textarea{box-sizing:border-box}`;
// input/textarea border-box: found by the ui golden on its first run — width:100% plus padding made
// the New project form 14px wider than its dialog at 320 px (TC-UI-PROJECTS-003 layout rule).
// DEMO_UI_MUTATION=wide-buttons — the `ui` golden's mutation proof (tests/golden/run.mjs): a CSS
// regression a functional test cannot see. Buttons gain 120px side padding; the visual baselines
// must fail and, at 320px, the layout checks must report the overflow.
const UI_MUTATION = process.env.DEMO_UI_MUTATION === 'wide-buttons' ? 'button{padding:6px 120px}' : '';
const layout = (title, body, me) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Demo</title><style>${STYLE}${UI_MUTATION}</style></head>
<body><header><a href="/projects">Demo</a>${me ? `<span>Signed in as ${esc(me.name)}</span>
<form method="post" action="/ui/sign-out"><button type="submit">Sign out</button></form>` : ''}</header>
<main>${body}</main></body></html>`;

const SIGN_IN = `<h1>Sign in</h1><form id="f" novalidate>
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
<p id="err" role="alert"></p><button type="submit">Sign in</button></form>
<script>f.onsubmit=async(e)=>{e.preventDefault();
const r=await fetch('/api/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})});
if(r.ok)location.href='/projects';else err.textContent='E-mail or password is wrong.'}</script>`;

function projectsPage(s) {
  const list = [...projects.values()].filter((p) => roleIn(p, s.user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = list
    .map((p) => `<tr><td><a href="/projects/${p.id}">${esc(p.name)}</a></td><td>${esc(roleIn(p, s.user))}</td><td>${p.count}</td></tr>`)
    .join('');
  return `<h1>Projects</h1>${s.user.isOwner ? '<button type="button" id="new">New project</button>' : ''}
<p id="count">${list.length} project${list.length === 1 ? '' : 's'}</p>
<table aria-label="Projects"><thead><tr><th scope="col">Name</th><th scope="col">Your role</th><th scope="col">Members</th></tr></thead>
<tbody>${rows || '<tr><td colspan="3">No projects yet.</td></tr>'}</tbody></table>
<dialog id="dlg" aria-labelledby="dlg-title"><form id="cf" novalidate><h2 id="dlg-title">New project</h2>
<label for="name">Name</label><input id="name" name="name" aria-describedby="name-err">
<label for="description">Description</label><textarea id="description" name="description"></textarea>
<p id="name-err" role="alert"></p><button type="submit" id="create">Create</button> <button type="button" id="cancel">Cancel</button></form></dialog>
<script>const csrf=${JSON.stringify(s.csrf)};const nb=document.getElementById('new');if(nb)nb.onclick=()=>dlg.showModal();
cancel.onclick=()=>dlg.close();const nameEl=document.getElementById('name');const create=document.getElementById('create');
cf.onsubmit=async(e)=>{e.preventDefault();${bug('double-submit') ? '' : 'if(create.disabled)return;create.disabled=true;'}
const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
body:JSON.stringify({name:nameEl.value,description:description.value||null})});
if(r.ok){location.reload();return}create.disabled=false;const p=await r.json();
document.getElementById('name-err').textContent=p.status===409?p.detail:'Name is required (1 to 80 characters).';
nameEl.setAttribute('aria-invalid','true');nameEl.focus()}</script>`;
}

// Rename form on the detail page. The page keeps the ETag it was rendered with and sends it as
// If-Match, so a save from a stale tab is refused (409, "Someone else changed…") instead of
// silently overwriting the other tab's change.
const editForm = (p, s) => `<form id="ef" novalidate aria-label="Rename project">
<label for="ename">New name</label><input id="ename" name="name" value="${esc(p.name)}" aria-describedby="eerr">
<p id="eerr" role="alert"></p><p id="emsg" role="status"></p><button type="submit" id="save">Save</button></form>
<script>{const csrf=${JSON.stringify(s.csrf)};let tag=${JSON.stringify(etag(p))};
const ef=document.getElementById('ef'),save=document.getElementById('save'),eerr=document.getElementById('eerr'),emsg=document.getElementById('emsg');
ef.onsubmit=async(e)=>{e.preventDefault();if(save.disabled)return;save.disabled=true;emsg.textContent='';eerr.textContent='';
const r=await fetch(${JSON.stringify(`/api/projects/${p.id}`)},{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'If-Match':tag},
body:JSON.stringify({name:document.getElementById('ename').value})});save.disabled=false;const b=await r.json();
if(r.ok){tag=r.headers.get('ETag');document.querySelector('h1').textContent=b.name;emsg.textContent='Saved.';return}
eerr.textContent=r.status===409?b.detail:'Name is required (1 to 80 characters).'}}</script>`;

function ui(req, res, url) {
  const s = currentSession(req);
  if (url.pathname === '/') {
    res.writeHead(302, { Location: s ? '/projects' : '/sign-in' });
    return res.end();
  }
  if (url.pathname === '/sign-in') return html(res, 200, layout('Sign in', SIGN_IN));
  if (!s) {
    res.writeHead(302, { Location: '/sign-in' });
    return res.end();
  }
  if (url.pathname === '/projects') return html(res, 200, layout('Projects', projectsPage(s), s.user));
  const m = url.pathname.match(/^\/projects\/([^/]+)$/);
  if (m) {
    const p = projects.get(m[1]);
    if (!p || !roleIn(p, s.user)) return html(res, 404, layout('Not found', '<h1>Project not found</h1>', s.user));
    const role = roleIn(p, s.user);
    return html(res, 200, layout(p.name, `<h1>${esc(p.name)}</h1><p>${esc(p.description ?? 'No description.')}</p>
<p>Your role: ${esc(role)}</p>${can.write(role) ? editForm(p, s) : ''}<a href="/projects">Back to projects</a>`, s.user));
  }
  return html(res, 404, layout('Not found', '<h1>Page not found</h1>', s.user));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.on('finish', () => log(res.statusCode >= 500 ? 'error' : 'info', `${req.method} ${url.pathname} ${res.statusCode}`));
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/ui/sign-out' && req.method === 'POST') {
      const s = currentSession(req);
      if (s) sessions.delete(s.sid);
      res.writeHead(303, { Location: '/sign-in', 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return ui(req, res, url);
  } catch (e) {
    log('error', 'unhandled exception', { err: String(e) });
    problem(res, 500, 'internal', 'Something went wrong.');
  }
});
// Node closes idle keep-alive sockets after 5 s; a client that reuses one at that instant gets
// ECONNRESET (seen with the model test's rarely-used per-account clients). Real servers sit behind a
// proxy with a longer idle timeout — so does this one.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 121_000;
server.listen(PORT, '127.0.0.1', () => console.log(`demo-app listening on http://127.0.0.1:${PORT}`));
