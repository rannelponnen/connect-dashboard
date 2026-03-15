// ─────────────────────────────────────────────
// CONNECT Events Marketing Dashboard — app.js
// ─────────────────────────────────────────────

// ── CONFIG ──────────────────────────────────
const EVENTS = {
  OHEC: { label: 'Oman Health Exhibition', sheetPrefix: 'OHEC', color: '#1C4488' },
  ODBW: { label: 'Oman Design & Build Week', sheetPrefix: 'ODBW', color: '#2a7ab5' },
  OPES: { label: 'Oman Petroleum & Energy Show', sheetPrefix: 'OPES', color: '#0d6e4e' },
  OSW:  { label: 'Oman Sustainability Week', sheetPrefix: 'OSW',  color: '#5cc98a' },
};

const CHART_COLORS = {
  navy:    '#1C4488',
  mint:    '#90e0b1',
  mintDark:'#5cc98a',
  blue:    '#2a7ab5',
  green:   '#0d6e4e',
  orange:  '#f0a800',
  red:     '#e05555',
  gray:    '#b0b0c0',
};

// Channel column layout in Weekly Tracker (0-indexed):
// Col 0: Weeks To Go | Col 1: W/C | Col 2: % of Target
// Col 3: 2024 Cumul | Col 4: 2024 Weekly
// Col 5: Target Cumul | Col 6: Target Weekly
// Col 7: Actual Cumul | Col 8: Actual Weekly
// Col 9: Diff Cumul | Col 10: Diff Weekly
// Col 11: (note) | Col 12: (note)
// Col 13: Email Target | Col 14: Email Actual | Col 15: Email Tgt Wkly | Col 16: Email Act Wkly
// Then each channel adds 4 cols: [Tgt Cumul, Act Cumul, Tgt Wkly, Act Wkly]
const CHANNEL_COLS = {
  Email:        { targetCumul: 13, actualCumul: 14 },
  Untracked:    { targetCumul: 17, actualCumul: 18 },
  Advocacy:     { targetCumul: 21, actualCumul: 22 },
  'Org Social': { targetCumul: 25, actualCumul: 26 },
  'Social Paid':{ targetCumul: 29, actualCumul: 30 },
  Partners:     { targetCumul: 33, actualCumul: 34 },
  'Search Paid':{ targetCumul: 37, actualCumul: 38 },
  'Paid Media': { targetCumul: 41, actualCumul: 42 },
  SMS:          { targetCumul: 45, actualCumul: 46 },
};

// ── STATE ────────────────────────────────────
const charts = {};
let cachedData = {};
let activeTab = 'overview';
let regActiveEvent = 'OHEC';
let budgetActiveEvent = 'OHEC';
let activePlatform = 'LinkedIn';
let emailData = null;
let socialData = null;

// ── API ──────────────────────────────────────
async function fetchSheet(sheetName, range) {
  const key = `${sheetName}|${range}`;
  if (cachedData[key]) return cachedData[key];
  const url = `/api/sheets?sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  cachedData[key] = json.values || [];
  return cachedData[key];
}

function clearCache() {
  cachedData = {};
}

// ── HELPERS ──────────────────────────────────
function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function pct(v) {
  return (num(v) * 100).toFixed(1) + '%';
}

function fmtNum(v) {
  return num(v).toLocaleString();
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(v) {
  const n = num(v);
  if (n === 0) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function ratePill(rate) {
  const r = num(rate);
  if (r === 0) return `<span class="rate-pill ok">—</span>`;
  const pctStr = (r < 1 ? (r * 100).toFixed(1) : r.toFixed(1)) + '%';
  if (r >= 0.25 || r >= 25) return `<span class="rate-pill good">${pctStr}</span>`;
  if (r >= 0.15 || r >= 15) return `<span class="rate-pill ok">${pctStr}</span>`;
  return `<span class="rate-pill low">${pctStr}</span>`;
}

function normaliseRate(v) {
  const n = num(v);
  // values stored as decimals (0.37) or percentages (37)
  return n > 1 ? n / 100 : n;
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function setLoading(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? 'flex' : 'none';
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) {
    el.textContent = '⚠ ' + msg;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// Find the latest week's row that has actual data (not ONSITE row)
function getLatestDataRow(rows) {
  // rows are newest-first after the 3 header rows
  for (const row of rows) {
    const weeksToGo = row[0];
    const wc = row[1];
    const actual = num(row[7]);
    if (wc && actual > 0 && String(weeksToGo) !== '-1') return row;
  }
  return rows[0] || [];
}

// ── WEEKLY TRACKER PARSER ────────────────────
async function loadWeeklyTracker(eventKey, year = '2025') {
  const sheetName = `${EVENTS[eventKey].sheetPrefix} ${year} - Weekly Tracker`;
  const rows = await fetchSheet(sheetName, 'A1:AZ1020');
  // Skip 3 header rows
  const dataRows = rows.slice(3).filter(r => r && r[1] && r[7] !== undefined);
  // Sort oldest first (highest weeks-to-go first)
  return dataRows.sort((a, b) => num(b[0]) - num(a[0]));
}

// ── TAB NAVIGATION ───────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(`tab-${tab}`);
  if (section) section.classList.add('active');

  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(n => n.classList.add('active'));

  const titles = { overview: 'Overview', registration: 'Registration Tracker', email: 'Email Performance', social: 'Social Media', budget: 'Budget & CPA' };
  document.getElementById('page-title').textContent = titles[tab] || tab;

  // Lazy-load tab data
  if (tab === 'registration') loadRegistrationTab(regActiveEvent);
  if (tab === 'email') loadEmailTab();
  if (tab === 'social') loadSocialTab();
  if (tab === 'budget') loadBudgetTab(budgetActiveEvent);
}

// ── TAB 1: OVERVIEW ──────────────────────────
async function loadOverview() {
  setLoading('overview-loading', true);
  setError('overview-error', null);
  const grid = document.getElementById('event-grid');
  const summaryCards = document.getElementById('summary-cards');
  grid.innerHTML = '';
  summaryCards.innerHTML = '';

  try {
    const results = await Promise.allSettled(
      Object.keys(EVENTS).map(async (key) => {
        try {
          const rows = await loadWeeklyTracker(key);
          const latest = getLatestDataRow(rows);
          const onsite = rows.find(r => String(r[0]) === '-1' || String(r[2]) === 'ONSITE');
          return { key, rows, latest, onsite };
        } catch {
          // Try 2024 fallback
          const rows = await loadWeeklyTracker(key, '2024');
          const latest = getLatestDataRow(rows);
          return { key, rows, latest, onsite: null, year: '2024' };
        }
      })
    );

    let totalTarget = 0, totalActual = 0;

    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const { key, latest, onsite, year } = result.value;
      const event = EVENTS[key];
      const target = num(latest[5]);
      const actual = num(latest[7]);
      const weeksToGo = num(latest[0]);
      const pctToTarget = target > 0 ? Math.min((actual / target) * 100, 150) : 0;
      const onSiteTotal = onsite ? num(onsite[3]) : 0;

      totalTarget += target;
      totalActual += actual;

      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `
        <div class="event-card-header">
          <h3>${key} ${year || '2025'}<br><small style="font-weight:400;font-size:0.72rem;opacity:0.8">${event.label}</small></h3>
          <span class="weeks-badge">${weeksToGo > 0 ? weeksToGo + ' wks' : weeksToGo === 0 ? 'This week' : 'Complete'}</span>
        </div>
        <div class="event-card-body">
          <div class="reg-row">
            <div class="reg-stat">
              <div class="reg-stat-val actual">${fmtNum(actual)}</div>
              <div class="reg-stat-label">Actual Reg</div>
            </div>
            <div class="reg-stat">
              <div class="reg-stat-val">${fmtNum(target)}</div>
              <div class="reg-stat-label">Target</div>
            </div>
            ${onSiteTotal > 0 ? `<div class="reg-stat">
              <div class="reg-stat-val" style="font-size:1.1rem">${fmtNum(onSiteTotal)}</div>
              <div class="reg-stat-label">2024 Actual</div>
            </div>` : ''}
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${Math.min(pctToTarget, 100)}%"></div>
          </div>
          <div class="pct-label">${pctToTarget.toFixed(1)}% to target</div>
        </div>
      `;
      grid.appendChild(card);
    });

    // Summary cards
    const overallPct = totalTarget > 0 ? ((totalActual / totalTarget) * 100).toFixed(1) : 0;
    summaryCards.innerHTML = `
      <div class="card">
        <div class="card-label">Total Registrations</div>
        <div class="card-value mint">${fmtNum(totalActual)}</div>
        <div class="card-sub">Across all active events</div>
      </div>
      <div class="card">
        <div class="card-label">Total Target</div>
        <div class="card-value">${fmtNum(totalTarget)}</div>
        <div class="card-sub">Combined event targets</div>
      </div>
      <div class="card">
        <div class="card-label">Overall % to Target</div>
        <div class="card-value ${overallPct >= 80 ? 'mint' : overallPct >= 50 ? '' : 'warn'}">${overallPct}%</div>
        <div class="card-sub">All events combined</div>
      </div>
    `;

    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (err) {
    setError('overview-error', err.message);
  } finally {
    setLoading('overview-loading', false);
  }
}

// ── TAB 2: REGISTRATION ──────────────────────
async function loadRegistrationTab(eventKey) {
  setLoading('reg-loading', true);
  setError('reg-error', null);
  destroyChart('reg-line-chart');
  destroyChart('reg-channel-chart');

  try {
    const rows = await loadWeeklyTracker(eventKey);
    const labels = rows.map(r => {
      const d = new Date(r[1]);
      return isNaN(d) ? r[1] : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });
    const actualCumul = rows.map(r => num(r[7]));
    const targetCumul = rows.map(r => num(r[5]));

    // Line chart: Actual vs Target
    const lineCtx = document.getElementById('reg-line-chart').getContext('2d');
    charts['reg-line-chart'] = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Registrations',
            data: actualCumul,
            borderColor: CHART_COLORS.mintDark,
            backgroundColor: 'rgba(92,201,138,0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: 'Target',
            data: targetCumul,
            borderColor: CHART_COLORS.navy,
            borderWidth: 2,
            borderDash: [6, 3],
            fill: false,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } },
        },
      },
    });

    // Stacked bar: channel breakdown (weekly actuals)
    const channelKeys = Object.keys(CHANNEL_COLS);
    const channelColors = ['#1C4488','#2a7ab5','#5cc98a','#90e0b1','#f0a800','#e05555','#b0b0c0','#0d6e4e','#6a4fc8'];
    const channelDatasets = channelKeys.map((ch, i) => ({
      label: ch,
      data: rows.map(r => num(r[CHANNEL_COLS[ch].actualCumul])),
      backgroundColor: channelColors[i % channelColors.length],
      stack: 'stack',
    }));

    const barCtx = document.getElementById('reg-channel-chart').getContext('2d');
    charts['reg-channel-chart'] = new Chart(barCtx, {
      type: 'bar',
      data: { labels, datasets: channelDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index' },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { callback: v => v.toLocaleString() } },
        },
      },
    });

  } catch (err) {
    setError('reg-error', err.message);
  } finally {
    setLoading('reg-loading', false);
  }
}

// ── TAB 3: EMAIL ─────────────────────────────
async function loadEmailTab() {
  if (emailData) { renderEmailTab(); return; }
  setLoading('email-loading', true);
  setError('email-error', null);
  try {
    emailData = await fetchSheet('Email Tracker', 'A1:P1000');
    renderEmailTab();
  } catch (err) {
    setError('email-error', err.message);
  } finally {
    setLoading('email-loading', false);
  }
}

function renderEmailTab() {
  const filterEvent = document.getElementById('email-event-filter').value;
  const rows = emailData.slice(1).filter(r => r && r[0] && r[7]); // skip header, need date + subject
  const filtered = filterEvent ? rows.filter(r => String(r[2] || '').toUpperCase().includes(filterEvent)) : rows;

  // Stats
  const openRates = filtered.map(r => normaliseRate(r[11])).filter(v => v > 0);
  const clickRates = filtered.map(r => normaliseRate(r[12])).filter(v => v > 0);
  const avgOpen = openRates.length ? (openRates.reduce((a, b) => a + b, 0) / openRates.length * 100).toFixed(1) : '—';
  const avgClick = clickRates.length ? (clickRates.reduce((a, b) => a + b, 0) / clickRates.length * 100).toFixed(1) : '—';
  const lastDate = filtered.length ? fmtDate(filtered[filtered.length - 1][0]) : '—';

  document.getElementById('email-stat-cards').innerHTML = `
    <div class="card">
      <div class="card-label">Total Campaigns</div>
      <div class="card-value">${filtered.length}</div>
      <div class="card-sub">${filterEvent || 'All events'}</div>
    </div>
    <div class="card">
      <div class="card-label">Avg Open Rate</div>
      <div class="card-value mint">${avgOpen}%</div>
      <div class="card-sub">Industry avg ~21%</div>
    </div>
    <div class="card">
      <div class="card-label">Avg Click Rate</div>
      <div class="card-value">${avgClick}%</div>
      <div class="card-sub">Industry avg ~2.3%</div>
    </div>
    <div class="card">
      <div class="card-label">Most Recent Send</div>
      <div class="card-value" style="font-size:1.1rem">${lastDate}</div>
    </div>
  `;

  // Charts: avg open/click by event
  const eventKeys = Object.keys(EVENTS);
  destroyChart('email-open-chart');
  destroyChart('email-click-chart');

  const openByEvent = eventKeys.map(k => {
    const evRows = rows.filter(r => String(r[2] || '').toUpperCase().includes(k));
    const vals = evRows.map(r => normaliseRate(r[11])).filter(v => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length * 100 : 0;
  });
  const clickByEvent = eventKeys.map(k => {
    const evRows = rows.filter(r => String(r[2] || '').toUpperCase().includes(k));
    const vals = evRows.map(r => normaliseRate(r[12])).filter(v => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length * 100 : 0;
  });

  const openCtx = document.getElementById('email-open-chart').getContext('2d');
  charts['email-open-chart'] = new Chart(openCtx, {
    type: 'bar',
    data: {
      labels: eventKeys,
      datasets: [{ label: 'Avg Open Rate %', data: openByEvent, backgroundColor: CHART_COLORS.navy, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => v.toFixed(1) + '%' } } },
    },
  });

  const clickCtx = document.getElementById('email-click-chart').getContext('2d');
  charts['email-click-chart'] = new Chart(clickCtx, {
    type: 'bar',
    data: {
      labels: eventKeys,
      datasets: [{ label: 'Avg Click Rate %', data: clickByEvent, backgroundColor: CHART_COLORS.mintDark, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => v.toFixed(1) + '%' } } },
    },
  });

  // Table: last 50 campaigns
  const tbody = document.getElementById('email-tbody');
  const tableRows = filtered.slice(-50).reverse();
  if (tableRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No campaigns found.</td></tr>';
    return;
  }
  tbody.innerHTML = tableRows.map(r => {
    const openRate = normaliseRate(r[11]);
    const clickRate = normaliseRate(r[12]);
    const ctr = normaliseRate(r[13]);
    return `
      <tr>
        <td style="white-space:nowrap">${fmtDate(r[0])}</td>
        <td>${r[2] || '—'}</td>
        <td><span class="truncate" title="${(r[7] || '').replace(/"/g, '&quot;')}">${r[7] || '—'}</span></td>
        <td>${r[9] || '—'}</td>
        <td>${ratePill(openRate)}</td>
        <td>${ratePill(clickRate)}</td>
        <td>${ratePill(ctr)}</td>
      </tr>
    `;
  }).join('');
}

// ── TAB 4: SOCIAL ────────────────────────────
async function loadSocialTab() {
  if (socialData) { renderSocialCharts(); return; }
  setLoading('social-loading', true);
  setError('social-error', null);
  try {
    socialData = await fetchSheet('Social Media Tracking', 'A1:Z200');
    renderSocialCharts();
  } catch (err) {
    setError('social-error', err.message);
  } finally {
    setLoading('social-loading', false);
  }
}

function parseSocialData(platform) {
  if (!socialData) return {};
  const result = {};

  // Find month labels from row 2 (index 2)
  const monthRow = socialData[2] || [];
  const months = monthRow.slice(1).filter(Boolean);

  let currentEvent = null;
  let currentPlatform = null;

  for (const row of socialData) {
    if (!row || row.every(c => !c)) continue;
    const firstCell = String(row[0] || row[1] || '').trim();

    if (['OPES', 'ODBW', 'OSW', 'OHEC', 'OHE'].includes(firstCell)) {
      currentEvent = firstCell;
      currentPlatform = null;
      continue;
    }

    if (firstCell === 'LinkedIn' || firstCell === 'Facebook' || firstCell === 'Instagram') {
      currentPlatform = firstCell;
      continue;
    }

    if (currentPlatform === platform && currentEvent) {
      const metric = String(row[1] || '').trim();
      if (['Followers', 'Impressions', 'Interactions', 'Posts'].includes(metric)) {
        const key = `${currentEvent}_${metric}`;
        if (!result[key]) result[key] = { event: currentEvent, metric, values: [] };
        result[key].values = months.map((m, i) => ({ month: m, value: num(row[i + 2]) }));
      }
    }
  }
  return { months, data: result };
}

function renderSocialCharts() {
  const { months, data } = parseSocialData(activePlatform);
  if (!months || months.length === 0) {
    setError('social-error', 'No social media data found for ' + activePlatform);
    return;
  }
  setError('social-error', null);

  destroyChart('social-followers-chart');
  destroyChart('social-impressions-chart');
  destroyChart('social-interactions-chart');

  const eventKeys = Object.keys(EVENTS);
  const colors = [CHART_COLORS.navy, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.mintDark];

  // Followers line chart
  const followerDatasets = eventKeys.map((k, i) => {
    const key = `${k}_Followers`;
    const vals = data[key] ? data[key].values.map(v => v.value) : months.map(() => 0);
    return { label: k, data: vals, borderColor: colors[i], backgroundColor: colors[i] + '20', fill: false, tension: 0.3, borderWidth: 2 };
  });

  const fCtx = document.getElementById('social-followers-chart').getContext('2d');
  charts['social-followers-chart'] = new Chart(fCtx, {
    type: 'line',
    data: { labels: months, datasets: followerDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: false, ticks: { callback: v => v.toLocaleString() } } },
    },
  });

  // Impressions bar chart
  const impDatasets = eventKeys.map((k, i) => {
    const key = `${k}_Impressions`;
    const vals = data[key] ? data[key].values.map(v => v.value) : months.map(() => 0);
    return { label: k, data: vals, backgroundColor: colors[i], borderRadius: 3 };
  });

  const iCtx = document.getElementById('social-impressions-chart').getContext('2d');
  charts['social-impressions-chart'] = new Chart(iCtx, {
    type: 'bar',
    data: { labels: months, datasets: impDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } },
    },
  });

  // Interactions bar chart
  const intDatasets = eventKeys.map((k, i) => {
    const key = `${k}_Interactions`;
    const vals = data[key] ? data[key].values.map(v => v.value) : months.map(() => 0);
    return { label: k, data: vals, backgroundColor: colors[i] + 'cc', borderRadius: 3 };
  });

  const inCtx = document.getElementById('social-interactions-chart').getContext('2d');
  charts['social-interactions-chart'] = new Chart(inCtx, {
    type: 'bar',
    data: { labels: months, datasets: intDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
    },
  });
}

// ── TAB 5: BUDGET & CPA ──────────────────────
async function loadBudgetTab(eventKey) {
  setLoading('budget-loading', true);
  setError('budget-error', null);
  destroyChart('budget-reg-chart');
  destroyChart('budget-cpa-chart');

  // Build year buttons dynamically
  const years = ['2026', '2025', '2024'];
  const yearSelector = document.getElementById('budget-year-selector');
  if (!yearSelector.children.length) {
    years.forEach((yr, i) => {
      const btn = document.createElement('button');
      btn.className = 'event-btn' + (i === 0 ? ' active' : '');
      btn.textContent = yr;
      btn.dataset.year = yr;
      btn.addEventListener('click', () => {
        yearSelector.querySelectorAll('.event-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadBudgetTabWithYear(eventKey, yr);
      });
      yearSelector.appendChild(btn);
    });
  }

  const activeYear = yearSelector.querySelector('.event-btn.active')?.dataset.year || '2025';
  await loadBudgetTabWithYear(eventKey, activeYear);
}

async function loadBudgetTabWithYear(eventKey, year) {
  setLoading('budget-loading', true);
  setError('budget-error', null);
  destroyChart('budget-reg-chart');
  destroyChart('budget-cpa-chart');

  try {
    const sheetName = `${EVENTS[eventKey].sheetPrefix} ${year} - RegBudg Calc`;
    const rows = await fetchSheet(sheetName, 'A1:G25');

    // Find header row (Channel, Budget, ...)
    let headerIdx = rows.findIndex(r => r && String(r[0]).toLowerCase().includes('channel'));
    if (headerIdx < 0) headerIdx = 0;
    const dataRows = rows.slice(headerIdx + 1).filter(r =>
      r && r[0] && !String(r[0]).toLowerCase().includes('total') && !String(r[0]).toLowerCase().includes('budget')
    );

    const channels = dataRows.map(r => r[0]);
    const budgets = dataRows.map(r => num(r[1]));
    const predReg = dataRows.map(r => num(r[3]));
    const actReg = dataRows.map(r => num(r[5]));
    const predCPA = dataRows.map(r => num(r[4]));
    const actCPA = dataRows.map(r => num(r[6]));

    // Bar chart: predicted vs actual registrations
    const regCtx = document.getElementById('budget-reg-chart').getContext('2d');
    charts['budget-reg-chart'] = new Chart(regCtx, {
      type: 'bar',
      data: {
        labels: channels,
        datasets: [
          { label: 'Predicted Reg', data: predReg, backgroundColor: CHART_COLORS.navy + '99', borderRadius: 3 },
          { label: 'Actual Reg', data: actReg, backgroundColor: CHART_COLORS.mintDark, borderRadius: 3 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });

    // Bar chart: CPA
    const cpaCtx = document.getElementById('budget-cpa-chart').getContext('2d');
    charts['budget-cpa-chart'] = new Chart(cpaCtx, {
      type: 'bar',
      data: {
        labels: channels,
        datasets: [
          { label: 'Predicted CPA', data: predCPA, backgroundColor: CHART_COLORS.navy + '99', borderRadius: 3 },
          { label: 'Actual CPA', data: actCPA, backgroundColor: CHART_COLORS.orange, borderRadius: 3 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(2) } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });

    // Table
    const tbody = document.getElementById('budget-tbody');
    tbody.innerHTML = dataRows.map(r => {
      const budget = num(r[1]);
      const pReg = num(r[3]);
      const aReg = num(r[5]);
      const pCPA = num(r[4]);
      const aCPA = num(r[6]);
      return `
        <tr>
          <td><strong>${r[0]}</strong></td>
          <td>${budget > 0 ? fmtCurrency(budget) : '—'}</td>
          <td>${pReg > 0 ? fmtNum(pReg) : '—'}</td>
          <td>${aReg > 0 ? fmtNum(aReg) : '—'}</td>
          <td>${pCPA > 0 ? fmtCurrency(pCPA) : '—'}</td>
          <td>${aCPA > 0 ? fmtCurrency(aCPA) : '—'}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    setError('budget-error', `Could not load ${eventKey} ${document.querySelector('#budget-year-selector .event-btn.active')?.dataset.year || ''} budget data: ${err.message}`);
  } finally {
    setLoading('budget-loading', false);
  }
}

// ── EVENT LISTENERS ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  // Registration event selector
  document.getElementById('reg-event-selector').addEventListener('click', e => {
    const btn = e.target.closest('[data-event]');
    if (!btn) return;
    document.querySelectorAll('#reg-event-selector .event-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    regActiveEvent = btn.dataset.event;
    loadRegistrationTab(regActiveEvent);
  });

  // Budget event selector
  document.getElementById('budget-event-selector').addEventListener('click', e => {
    const btn = e.target.closest('[data-event]');
    if (!btn) return;
    document.querySelectorAll('#budget-event-selector .event-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    budgetActiveEvent = btn.dataset.event;
    loadBudgetTab(budgetActiveEvent);
  });

  // Email event filter
  document.getElementById('email-event-filter').addEventListener('change', () => {
    if (emailData) renderEmailTab();
  });

  // Platform tabs
  document.querySelectorAll('.platform-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activePlatform = tab.dataset.platform;
      renderSocialCharts();
    });
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('loading');
    btn.textContent = '↻ Refreshing…';
    clearCache();
    emailData = null;
    socialData = null;
    await loadOverview();
    if (activeTab !== 'overview') switchTab(activeTab);
    btn.classList.remove('loading');
    btn.textContent = '↻ Refresh';
  });

  // Initial load
  loadOverview();
});
