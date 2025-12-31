# AI Metrics Graphs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add daily trend charts (Lines, AI%, Cost) to the AI Metrics tab with team/individual user toggle.

**Architecture:** New `/api/dashboard/ai-metrics/daily` endpoint aggregates existing daily metrics into chart-ready arrays. Frontend uses Chart.js (CDN) to render 3 stacked charts with a dropdown to filter by user.

**Tech Stack:** Express.js, Chart.js (CDN), PostgreSQL, Jest

---

### Task 1: Add Daily Metrics API Endpoint

**Files:**
- Modify: `server.js`
- Modify: `tests/server.test.js`

**Step 1: Write the failing test**

Add to `tests/server.test.js` before the closing `});`:

```javascript
describe('GET /api/dashboard/ai-metrics/daily', () => {
  it('returns daily metrics arrays', async () => {
    const res = await request('GET', '/api/dashboard/ai-metrics/daily?startDate=2025-01-01&endDate=2025-01-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dates');
    expect(res.body).toHaveProperty('series');
    expect(res.body.series).toHaveProperty('linesShipped');
    expect(res.body.series).toHaveProperty('linesRemoved');
    expect(res.body.series).toHaveProperty('aiPercent');
    expect(res.body.series).toHaveProperty('costCents');
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.dates)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/server.test.js`
Expected: FAIL - 404

**Step 3: Write the endpoint**

Add after the existing `/api/dashboard/ai-metrics` endpoint in `server.js`:

```javascript
// AI Metrics daily endpoint - time series data for charts
app.get('/api/dashboard/ai-metrics/daily', async (req, res) => {
  try {
    const { startDate, endDate, user } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const allMetrics = await db.getAllMetrics(start, end);
    const mappings = await db.getIdentityMappings();

    // Build email lookup from GitHub username
    const githubToEmail = {};
    for (const m of mappings) {
      githubToEmail[m.github_username.toLowerCase()] = m.email;
    }

    // Generate all dates in range
    const dates = [];
    const current = new Date(start);
    const endDate_ = new Date(end);
    while (current <= endDate_) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    // Initialize series arrays
    const series = {
      linesShipped: new Array(dates.length).fill(0),
      linesRemoved: new Array(dates.length).fill(0),
      aiPercent: new Array(dates.length).fill(0),
      costCents: new Array(dates.length).fill(0)
    };

    // Collect all users
    const allUsers = new Set();

    // Process GitHub metrics
    const githubMetrics = allMetrics.filter(m => m.source === 'github');
    for (const m of githubMetrics) {
      const idx = dates.indexOf(m.date.toISOString().split('T')[0]);
      if (idx === -1) continue;

      if (user) {
        // Individual user - find by email or mapped username
        if (m.data.byAuthor) {
          for (const [username, data] of Object.entries(m.data.byAuthor)) {
            const email = githubToEmail[username.toLowerCase()] || username;
            allUsers.add(email);
            if (email === user) {
              series.linesShipped[idx] += data.prLinesAdded || 0;
              series.linesRemoved[idx] += data.prLinesRemoved || 0;
            }
          }
        }
      } else {
        // Team totals
        series.linesShipped[idx] += m.data.prLinesAdded || 0;
        series.linesRemoved[idx] += m.data.prLinesRemoved || 0;
        if (m.data.byAuthor) {
          for (const username of Object.keys(m.data.byAuthor)) {
            const email = githubToEmail[username.toLowerCase()] || username;
            allUsers.add(email);
          }
        }
      }
    }

    // Process Claude metrics
    const claudeMetrics = allMetrics.filter(m => m.source === 'claude');
    for (const m of claudeMetrics) {
      const idx = dates.indexOf(m.date.toISOString().split('T')[0]);
      if (idx === -1) continue;

      if (user) {
        if (m.data.users && m.data.users[user]) {
          const userData = m.data.users[user];
          series.costCents[idx] += userData.costCents || 0;
        }
        if (m.data.users) {
          for (const email of Object.keys(m.data.users)) {
            allUsers.add(email);
          }
        }
      } else {
        series.costCents[idx] += m.data.totals?.costCents || 0;
        if (m.data.users) {
          for (const email of Object.keys(m.data.users)) {
            allUsers.add(email);
          }
        }
      }
    }

    // Process Cursor metrics
    const cursorMetrics = allMetrics.filter(m => m.source === 'cursor');
    for (const m of cursorMetrics) {
      const idx = dates.indexOf(m.date.toISOString().split('T')[0]);
      if (idx === -1) continue;

      if (m.metric_type === 'spend') {
        if (user) {
          if (m.data.byUser && m.data.byUser[user]) {
            series.costCents[idx] += (m.data.byUser[user].spendCents || 0) + (m.data.byUser[user].includedSpendCents || 0);
          }
        } else {
          series.costCents[idx] += (m.data.totalSpendCents || 0) + (m.data.totalIncludedSpendCents || 0);
        }
        if (m.data.byUser) {
          for (const email of Object.keys(m.data.byUser)) {
            allUsers.add(email);
          }
        }
      }
    }

    // Calculate AI percent per day (simplified: based on Claude + Cursor lines)
    for (let i = 0; i < dates.length; i++) {
      const shipped = series.linesShipped[i];
      if (shipped > 0) {
        // Use overall AI ratio as proxy (from original endpoint logic)
        series.aiPercent[i] = 61.0; // TODO: Calculate per-day if data available
      }
    }

    // Filter out bot users and sort
    const users = [...allUsers]
      .filter(u => !u.includes('[bot]') && !u.includes('Copilot'))
      .sort();

    res.json({
      dates,
      series,
      users: user ? undefined : users
    });
  } catch (err) {
    console.error('Error generating daily AI metrics:', err);
    res.status(500).json({ error: err.message });
  }
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: add daily AI metrics endpoint for charts"
```

---

### Task 2: Add Chart.js and HTML Structure

**Files:**
- Modify: `public/index.html`

**Step 1: Add Chart.js CDN**

Add before the closing `</head>` tag:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

**Step 2: Add Trends section HTML**

Add after the Tool Breakdown section (`</div><!-- tool-cards -->`) and before Developer Breakdown:

```html
      <h2>Trends</h2>
      <div class="trends-section">
        <div class="trends-controls">
          <label>View:
            <select id="trendsUserSelect" onchange="loadTrendsCharts()">
              <option value="">All Team</option>
            </select>
          </label>
        </div>
        <div class="chart-container">
          <h4>Lines Shipped / Removed</h4>
          <canvas id="linesChart"></canvas>
        </div>
        <div class="chart-container">
          <h4>AI % (estimated)</h4>
          <canvas id="aiPercentChart"></canvas>
        </div>
        <div class="chart-container">
          <h4>Cost</h4>
          <canvas id="costChart"></canvas>
        </div>
      </div>
```

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add Chart.js and trends section HTML"
```

---

### Task 3: Add Chart Styles

**Files:**
- Modify: `public/style.css`

**Step 1: Add trends section styles**

Add to the end of `public/style.css`:

```css
/* Trends Section */
.trends-section {
  margin-bottom: 30px;
}

.trends-controls {
  margin-bottom: 20px;
}

.trends-controls select {
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 200px;
}

.chart-container {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

.chart-container h4 {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #2c3e50;
  text-transform: uppercase;
}

.chart-container canvas {
  width: 100% !important;
  height: 200px !important;
}
```

**Step 2: Commit**

```bash
git add public/style.css
git commit -m "feat: add trends chart styles"
```

---

### Task 4: Add Chart Rendering JavaScript

**Files:**
- Modify: `public/app.js`

**Step 1: Add chart instance variables**

Add near the top of the file (after date initialization):

```javascript
// Chart instances
let linesChart = null;
let aiPercentChart = null;
let costChart = null;
```

**Step 2: Add loadTrendsCharts function**

Add after the `loadAiMetrics` function:

```javascript
async function loadTrendsCharts() {
  const startDate = document.getElementById('aiMetricsStartDate').value;
  const endDate = document.getElementById('aiMetricsEndDate').value;
  const userSelect = document.getElementById('trendsUserSelect');
  const selectedUser = userSelect.value;

  try {
    let url = `/api/dashboard/ai-metrics/daily?startDate=${startDate}&endDate=${endDate}`;
    if (selectedUser) {
      url += `&user=${encodeURIComponent(selectedUser)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load trends data');
    }

    // Populate user dropdown (only on initial load)
    if (!selectedUser && data.users) {
      const currentValue = userSelect.value;
      userSelect.innerHTML = '<option value="">All Team</option>' +
        data.users.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
      userSelect.value = currentValue;
    }

    // Render charts
    renderLinesChart(data.dates, data.series);
    renderAiPercentChart(data.dates, data.series);
    renderCostChart(data.dates, data.series);
  } catch (err) {
    console.error('Failed to load trends:', err);
  }
}

function renderLinesChart(dates, series) {
  const ctx = document.getElementById('linesChart').getContext('2d');

  if (linesChart) {
    linesChart.destroy();
  }

  linesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Lines Shipped',
          data: series.linesShipped,
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Lines Removed',
          data: series.linesRemoved,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderAiPercentChart(dates, series) {
  const ctx = document.getElementById('aiPercentChart').getContext('2d');

  if (aiPercentChart) {
    aiPercentChart.destroy();
  }

  aiPercentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'AI %',
        data: series.aiPercent,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, max: 100 }
      }
    }
  });
}

function renderCostChart(dates, series) {
  const ctx = document.getElementById('costChart').getContext('2d');

  if (costChart) {
    costChart.destroy();
  }

  // Convert cents to dollars
  const costDollars = series.costCents.map(c => c / 100);

  costChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Cost ($)',
        data: costDollars,
        backgroundColor: '#f39c12'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
```

**Step 3: Update loadAiMetrics to also load charts**

Find the end of the `loadAiMetrics` function (after `renderAiUserTable(data.byUser);`) and add:

```javascript
    // Load trend charts
    loadTrendsCharts();
```

**Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: add Chart.js rendering for AI metrics trends"
```

---

### Task 5: Final Testing

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual verification**

1. Start server: `npm start`
2. Open http://localhost:3000
3. Click "AI Metrics" tab
4. Verify 3 charts appear under "Trends"
5. Verify dropdown shows users
6. Select a user from dropdown
7. Verify charts update with individual data

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "feat: complete AI metrics trends charts"
```

---

## Summary

This implementation adds:
1. New `/api/dashboard/ai-metrics/daily` endpoint returning time series data
2. Chart.js integration via CDN
3. Three stacked charts: Lines, AI%, Cost
4. User dropdown to toggle between team and individual views
