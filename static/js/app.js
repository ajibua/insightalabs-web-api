// ── Config ────────────────────────────────────────────────────────────────────
const API = window.INSIGHTA_API_URL || 'http://127.0.0.1:8080';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  user: null,
  profilesPage: 1,
  profilesLimit: 10,
  profilesFilters: {},
  searchPage: 1,
  searchLimit: 10,
  lastQuery: '',
};

// ── Cookie helper ─────────────────────────────────────────────────────────────
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── API client ────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const url = `${API}${path}`;
  const headers = { 'X-API-Version': '1', ...(opts.headers || {}) };

  // Add CSRF token for non-GET requests
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = getCookie('csrf_token');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(url, {
    ...opts,
    credentials: 'include',
    headers,
  });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) { showLogin(); return null; }
    return apiFetch(path, opts);
  }

  return res;
}

async function tryRefresh() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const csrf = getCookie('csrf_token');
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST', credentials: 'include',
      headers,
      body: JSON.stringify({}),
    });
    return r.ok;
  } catch { return false; }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const r = await fetch(`${API}/auth/me`, {
      credentials: 'include',
      headers: { 'X-API-Version': '1' },
    });
    if (!r.ok) { showLogin(); return false; }
    state.user = (await r.json()).data;
    renderUser();
    return true;
  } catch {
    showLogin();
    return false;
  }
}

function renderUser() {
  const u = state.user;
  if (!u) return;
  document.getElementById('topbar-username').textContent = `@${u.username}`;
  if (u.avatar_url) {
    document.getElementById('topbar-avatar').src = u.avatar_url;
    document.getElementById('topbar-avatar').classList.remove('hidden');
  }
  // Reveal admin-only UI
  if (u.role === 'admin') {
    document.getElementById('btn-create-profile')?.classList.remove('hidden');
    document.getElementById('profiles-actions-th')?.classList.remove('hidden');
  }
}

function showLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function logout() {
  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCookie('csrf_token');
  if (csrf) headers['X-CSRF-Token'] = csrf;

  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });
  state.user = null;
  showLogin();
}

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = {
    dashboard: 'Dashboard', profiles: 'Profiles',
    search: 'Search', account: 'Account',
  }[page] || 'Insighta';

  if (page === 'dashboard') loadDashboard();
  if (page === 'profiles') loadProfiles();
  if (page === 'account') loadAccount();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [totalRes, maleRes, femaleRes, ngRes] = await Promise.all([
    apiFetch('/api/profiles?limit=1'),
    apiFetch('/api/profiles?gender=male&limit=1'),
    apiFetch('/api/profiles?gender=female&limit=1'),
    apiFetch('/api/profiles?country_id=NG&limit=1'),
  ]);
  if (!totalRes) return;

  const total = (await totalRes.json()).total;
  const males = (await maleRes.json()).total;
  const females = (await femaleRes.json()).total;
  const ng = (await ngRes.json()).total;

  animateCounter('stat-total', total);
  animateCounter('stat-male', males);
  animateCounter('stat-female', females);
  animateCounter('stat-ng', ng);

  // Load recent profiles
  const recentRes = await apiFetch('/api/profiles?sort_by=created_at&order=desc&limit=5');
  if (!recentRes) return;
  const recentData = await recentRes.json();
  renderProfileTable('recent-table-body', recentData.data);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  const duration = 600;
  const start = Date.now();
  const startVal = 0;
  function update() {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(startVal + (target - startVal) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Profiles ──────────────────────────────────────────────────────────────────
async function loadProfiles() {
  document.getElementById('profiles-body').innerHTML = '<tr><td colspan="7"><div class="loader"><span class="spin"></span> Loading...</div></td></tr>';

  const params = new URLSearchParams({
    page: state.profilesPage,
    limit: state.profilesLimit,
    ...state.profilesFilters,
  });
  const res = await apiFetch(`/api/profiles?${params}`);
  if (!res) return;
  const data = await res.json();
  if (data.status !== 'success') { showToast(data.message || 'Error', 'error'); return; }

  renderProfileTable('profiles-body', data.data, true);
  renderPagination('profiles-pagination', data.page, data.total_pages, data.total, (p) => {
    state.profilesPage = p;
    loadProfiles();
  });
}

function applyProfileFilters() {
  const f = {};
  const gender = document.getElementById('f-gender').value;
  const ageGroup = document.getElementById('f-age-group').value;
  const country = document.getElementById('f-country').value.trim().toUpperCase();
  const minAge = document.getElementById('f-min-age').value;
  const maxAge = document.getElementById('f-max-age').value;
  const sortBy = document.getElementById('f-sort-by').value;
  const order = document.getElementById('f-order').value;

  if (gender) f.gender = gender;
  if (ageGroup) f.age_group = ageGroup;
  if (country) f.country_id = country;
  if (minAge) f.min_age = minAge;
  if (maxAge) f.max_age = maxAge;
  if (sortBy) f.sort_by = sortBy;
  if (order) f.order = order;

  state.profilesFilters = f;
  state.profilesPage = 1;
  loadProfiles();
}

function clearProfileFilters() {
  document.getElementById('f-gender').value = '';
  document.getElementById('f-age-group').value = '';
  document.getElementById('f-sort-by').value = '';
  document.getElementById('f-order').value = 'asc';
  document.getElementById('f-country').value = '';
  document.getElementById('f-min-age').value = '';
  document.getElementById('f-max-age').value = '';
  state.profilesFilters = {};
  state.profilesPage = 1;
  loadProfiles();
}

async function exportCSV() {
  const params = new URLSearchParams({ format: 'csv', ...state.profilesFilters });
  const res = await apiFetch(`/api/profiles/export?${params}`);
  if (!res || !res.ok) { showToast('Export failed', 'error'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `profiles_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded!', 'success');
}

// ── Search ────────────────────────────────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  state.lastQuery = q;
  state.searchPage = 1;
  await runSearch();
}

async function runSearch() {
  document.getElementById('search-results').innerHTML = '<div class="loader"><span class="spin"></span> Searching...</div>';
  const params = new URLSearchParams({ q: state.lastQuery, page: state.searchPage, limit: state.searchLimit });
  const res = await apiFetch(`/api/profiles/search?${params}`);
  if (!res) return;
  const data = await res.json();

  if (data.status !== 'success') {
    document.getElementById('search-results').innerHTML = `<div class="empty">${data.detail || data.message || 'Unable to interpret query'}</div>`;
    return;
  }

  if (!data.data || data.data.length === 0) {
    document.getElementById('search-results').innerHTML = '<div class="empty">No profiles found.</div>';
    document.getElementById('search-pagination-inner').innerHTML = '';
    return;
  }

  const wrap = document.createElement('div');
  const table = buildProfileTable(data.data);
  wrap.appendChild(table);
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results').appendChild(wrap);

  renderPagination('search-pagination-inner', data.page, data.total_pages, data.total, (p) => {
    state.searchPage = p;
    runSearch();
  });
}

// ── Account ───────────────────────────────────────────────────────────────────
function loadAccount() {
  const u = state.user;
  if (!u) return;
  document.getElementById('acc-username').textContent = `@${u.username}`;
  document.getElementById('acc-email').textContent = u.email || '—';
  document.getElementById('acc-role').innerHTML = `<span class="badge badge-${u.role}">${u.role}</span>`;
  document.getElementById('acc-active').textContent = u.is_active ? 'Active' : 'Disabled';
  document.getElementById('acc-joined').textContent = u.created_at ? u.created_at.slice(0, 10) : '—';
  document.getElementById('acc-last-login').textContent = u.last_login_at ? u.last_login_at.slice(0, 19).replace('T', ' ') : '—';
  if (u.avatar_url) {
    const img = document.getElementById('acc-avatar');
    img.src = u.avatar_url;
    img.classList.remove('hidden');
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderProfileTable(tbodyId, profiles, showActions = false) {
  const tbody = document.getElementById(tbodyId);
  const isAdmin = state.user?.role === 'admin';
  const colSpan = (showActions && isAdmin) ? 8 : 7;
  if (!profiles || !profiles.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty">No profiles found.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = profiles.map(p => `
    <tr>
      <td style="font-weight:600">${esc(p.name)}</td>
      <td><span class="badge badge-${p.gender}">${p.gender}</span></td>
      <td>${p.age}</td>
      <td><span class="badge badge-${p.age_group}">${p.age_group}</span></td>
      <td>${esc(p.country_name)} <span style="color:var(--muted)">(${p.country_id})</span></td>
      <td>${p.gender_probability.toFixed(2)}</td>
      <td>${p.country_probability.toFixed(2)}</td>
      ${showActions && isAdmin ? `<td><button class="btn btn-danger btn-sm" onclick="deleteProfile('${p.id}', '${esc(p.name)}')">Delete</button></td>` : ''}
    </tr>`).join('');
}

function buildProfileTable(profiles) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap card';
  wrap.innerHTML = `<table>
    <thead><tr>
      <th>Name</th><th>Gender</th><th>Age</th>
      <th>Age Group</th><th>Country</th><th>G.Prob</th><th>C.Prob</th>
    </tr></thead>
    <tbody>${profiles.map(p => `
      <tr>
        <td style="font-weight:600">${esc(p.name)}</td>
        <td><span class="badge badge-${p.gender}">${p.gender}</span></td>
        <td>${p.age}</td>
        <td><span class="badge badge-${p.age_group}">${p.age_group}</span></td>
        <td>${esc(p.country_name)} <span style="color:var(--muted)">(${p.country_id})</span></td>
        <td>${p.gender_probability.toFixed(2)}</td>
        <td>${p.country_probability.toFixed(2)}</td>
      </tr>`).join('')}
    </tbody></table>`;
  return wrap;
}

function renderPagination(containerId, page, totalPages, total, onPage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);

  el.innerHTML = `
    <div class="pagination">
      <span>${total.toLocaleString()} results</span>
      <div class="page-btns">
        <button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">&larr;</button>
        ${nums.map(n => `<button class="page-btn ${n === page ? 'active' : ''}" data-page="${n}">${n}</button>`).join('')}
        <button class="page-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">&rarr;</button>
      </div>
      <span>Page ${page} of ${totalPages}</span>
    </div>`;

  // Use event delegation instead of inline onclick
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) onPage(p);
    });
  });
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Admin: Create Profile ───────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('create-name-input').value = '';
  document.getElementById('create-modal-error').style.display = 'none';
  document.getElementById('create-submit-btn').disabled = false;
  document.getElementById('create-submit-btn').textContent = 'Create';
  document.getElementById('create-modal-backdrop').classList.remove('hidden');
  setTimeout(() => document.getElementById('create-name-input').focus(), 50);
}

function closeCreateModal() {
  document.getElementById('create-modal-backdrop').classList.add('hidden');
}

async function submitCreateProfile() {
  const name = document.getElementById('create-name-input').value.trim();
  const errEl = document.getElementById('create-modal-error');
  const btn = document.getElementById('create-submit-btn');
  if (!name) {
    errEl.textContent = 'Please enter a name.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const res = await apiFetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  btn.disabled = false;
  btn.textContent = 'Create';

  if (!res) return;
  if (res.status === 409) {
    errEl.textContent = 'A profile with that name already exists.';
    errEl.style.display = 'block';
    return;
  }
  if (res.status === 403) {
    errEl.textContent = 'Admin access required.';
    errEl.style.display = 'block';
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errEl.textContent = body.detail || body.message || 'Failed to create profile.';
    errEl.style.display = 'block';
    return;
  }

  closeCreateModal();
  showToast(`Profile created!`, 'success');
  state.profilesPage = 1;
  loadProfiles();
}

// ── Admin: Delete Profile ───────────────────────────────────────────────────
async function deleteProfile(id, name) {
  if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) return;
  const res = await apiFetch(`/api/profiles/${id}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok) {
    showToast(`"${name}" deleted.`, 'success');
    loadProfiles();
  } else {
    const body = await res.json().catch(() => ({}));
    showToast(body.detail || 'Delete failed.', 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (authed) {
    showApp();
    navigate('dashboard');
  }
});
