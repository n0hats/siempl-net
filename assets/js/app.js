/* siempl.net — feed renderer */

const FEEDS_URL = './data/feeds.json';

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  items:        [],
  filtered:     [],
  activeSource: 'all',
  activeCategory: 'all',
  query:        '',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const grid        = document.getElementById('feed-grid');
const searchInput = document.getElementById('search');
const totalEl     = document.getElementById('stat-total');
const newEl       = document.getElementById('stat-new');
const updatedEl   = document.getElementById('stat-updated');
const sourceFilters   = document.getElementById('source-filters');
const categoryFilters = document.getElementById('category-filters');

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  const now    = Date.now();
  const then   = new Date(isoString).getTime();
  const diff   = Math.max(0, now - then);
  const mins   = Math.floor(diff / 60000);
  const hours  = Math.floor(diff / 3600000);
  const days   = Math.floor(diff / 86400000);

  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isNew(isoString) {
  return (Date.now() - new Date(isoString).getTime()) < 86400000; // < 24h
}

function formatUpdated(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCard(item) {
  const fresh = isNew(item.published);
  const tagHTML = (item.tags || [])
    .map(t => `<span class="tag tag-${t}">${t}</span>`)
    .join('');

  // Safely escape title for HTML attribute
  const titleEsc = item.title.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
    <article class="card" style="--source-color:${item.source_color}">
      <div class="card-meta">
        <div class="card-meta-left">
          <span class="source-badge"
                style="color:${item.source_color};border-color:${item.source_color}20;background:${item.source_color}12">
            ${item.source}
          </span>
          ${fresh ? '<span class="badge-new">NEW</span>' : ''}
          ${tagHTML}
        </div>
        <span class="card-time" title="${item.published}">${timeAgo(item.published)}</span>
      </div>

      <h2 class="card-title">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer"
           title="${titleEsc}">${item.title}</a>
      </h2>

      ${item.summary ? `<p class="card-summary">${item.summary}</p>` : ''}

      <div class="card-footer">
        <a class="read-link" href="${item.url}" target="_blank" rel="noopener noreferrer">
          Read more <span>→</span>
        </a>
        <span style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">
          ${item.source_category}
        </span>
      </div>
    </article>`;
}

function renderGrid() {
  if (!state.filtered.length) {
    grid.innerHTML = `
      <div class="state-msg">
        <div class="big">⌀</div>
        <p>No results found.</p>
      </div>`;
    return;
  }
  grid.innerHTML = state.filtered.map(renderCard).join('');
}

function renderSkeleton(n = 9) {
  grid.innerHTML = Array.from({ length: n }, () => `
    <article class="card" style="gap:.75rem">
      <div style="display:flex;gap:.5rem">
        <div class="skeleton" style="width:90px"></div>
        <div class="skeleton" style="width:36px;margin-left:auto"></div>
      </div>
      <div class="skeleton" style="height:16px;width:85%"></div>
      <div class="skeleton" style="height:16px;width:65%"></div>
      <div class="skeleton" style="height:10px;width:90%;margin-top:.25rem"></div>
      <div class="skeleton" style="height:10px;width:75%"></div>
    </article>`).join('');
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function applyFilters() {
  const q = state.query.toLowerCase().trim();

  state.filtered = state.items.filter(item => {
    const sourceMatch   = state.activeSource   === 'all' || item.source === state.activeSource;
    const catMatch      = state.activeCategory === 'all' || item.source_category === state.activeCategory;
    const searchMatch   = !q
      || item.title.toLowerCase().includes(q)
      || item.summary.toLowerCase().includes(q)
      || item.source.toLowerCase().includes(q)
      || (item.tags || []).some(t => t.toLowerCase().includes(q));

    return sourceMatch && catMatch && searchMatch;
  });

  updateStats();
  renderGrid();
}

function updateStats() {
  const newCount = state.filtered.filter(i => isNew(i.published)).length;
  if (totalEl)   totalEl.textContent   = state.filtered.length.toLocaleString();
  if (newEl)     newEl.textContent     = newCount;
}

// ── Filter UI ─────────────────────────────────────────────────────────────────

function buildFilters(items) {
  // Sources
  const sources = [...new Set(items.map(i => i.source))].sort();
  const srcBtns = [makeFilterBtn('all', 'All Sources', 'source')]
    .concat(sources.map(s => makeFilterBtn(s, s, 'source')));
  sourceFilters.innerHTML = srcBtns.join('');

  // Categories
  const cats = [...new Set(items.map(i => i.source_category))].sort();
  const catBtns = [makeFilterBtn('all', 'All Categories', 'category')]
    .concat(cats.map(c => makeFilterBtn(c, c.replace('-', ' '), 'category')));
  categoryFilters.innerHTML = catBtns.join('');

  // Attach events
  document.querySelectorAll('.filter-btn[data-type=source]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeSource = btn.dataset.value;
      document.querySelectorAll('.filter-btn[data-type=source]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });

  document.querySelectorAll('.filter-btn[data-type=category]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.value;
      document.querySelectorAll('.filter-btn[data-type=category]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });
}

function makeFilterBtn(value, label, type) {
  const active = value === 'all' ? 'active' : '';
  return `<button class="filter-btn ${active}" data-value="${value}" data-type="${type}">${label}</button>`;
}

// ── Data Fetch ────────────────────────────────────────────────────────────────

async function loadFeeds() {
  renderSkeleton();

  try {
    const resp = await fetch(FEEDS_URL + '?t=' + Math.floor(Date.now() / 300000)); // 5-min cache bust
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    state.items    = data.items || [];
    state.filtered = state.items;

    if (updatedEl) updatedEl.textContent = formatUpdated(data.last_updated);

    buildFilters(state.items);
    applyFilters();

    // Warn about failed sources
    if (data.failed_sources && data.failed_sources.length) {
      console.warn('[siempl] Failed sources:', data.failed_sources.join(', '));
    }
  } catch (err) {
    console.error('[siempl] Failed to load feeds:', err);
    grid.innerHTML = `
      <div class="state-msg">
        <div class="big">!</div>
        <p>Could not load feeds.<br>
           Run <code>python scripts/fetch_feeds.py</code> to generate data.</p>
      </div>`;
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  applyFilters();
});

// Keyboard shortcut: '/' to focus search
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') {
    searchInput.value = '';
    state.query = '';
    applyFilters();
    searchInput.blur();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadFeeds();
