# AI Metrics Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI Metrics tab showing combined AI contribution metrics across GitHub, Claude Code, and Cursor with summary cards, tool breakdown, and per-user drill-down.

**Architecture:** Enhance GitHub backfill to fetch PR line stats for merged PRs. Add new `/api/dashboard/ai-metrics` endpoint that aggregates data from all three sources and calculates derived metrics (aiShippedPercent, aiAttributedPrPercent). Frontend adds new tab with summary cards, tool breakdown cards, and expandable user table.

**Tech Stack:** Express.js, PostgreSQL, vanilla JavaScript, Jest

---

### Task 1: Add GitHub PR Line Stats Fetching

**Files:**
- Modify: `lib/github.js` (add fetchPRDetails function)
- Modify: `tests/github.test.js` (add tests)

**Step 1: Write the failing test**

Add to `tests/github.test.js` before the closing `});`:

```javascript
describe('fetchPRDetails', () => {
  it('returns additions and deletions for a PR', async () => {
    // This is a mock test - actual API test would need token
    const { parsePRWithDetails } = require('../lib/github');
    const pr = {
      number: 1,
      additions: 100,
      deletions: 50,
      user: { login: 'alice' },
      merged_at: '2025-01-01T12:00:00Z',
      created_at: '2025-01-01T10:00:00Z'
    };
    const result = parsePRWithDetails(pr);
    expect(result.additions).toBe(100);
    expect(result.deletions).toBe(50);
    expect(result.author).toBe('alice');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/github.test.js`
Expected: FAIL - parsePRWithDetails is not defined

**Step 3: Add parsePRWithDetails function**

Add to `lib/github.js` before `module.exports`:

```javascript
function parsePRWithDetails(pr) {
  return {
    number: pr.number,
    author: pr.user?.login || 'unknown',
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    merged: !!pr.merged_at,
    cycleTimeHours: calculateCycleTime(pr)
  };
}

async function fetchPRDetails(token, owner, repo, prNumber) {
  const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}`;
  return githubRequest(token, endpoint);
}

async function fetchMergedPRsWithDetails(token, owner, repo, prs) {
  const mergedPRs = prs.filter(pr => pr.merged_at);
  const results = [];

  for (const pr of mergedPRs) {
    try {
      const details = await fetchPRDetails(token, owner, repo, pr.number);
      results.push(parsePRWithDetails(details));
    } catch (err) {
      console.warn(`Failed to fetch PR #${pr.number} details:`, err.message);
    }
  }

  return results;
}
```

**Step 4: Update module.exports**

Change `module.exports` in `lib/github.js` to:

```javascript
module.exports = {
  calculateCycleTime,
  parsePRs,
  parsePRWithDetails,
  fetchPRs,
  fetchPRsDateRange,
  fetchPRDetails,
  fetchMergedPRsWithDetails,
  fetchReviewComments,
  fetchIssueComments,
  githubRequest
};
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/github.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/github.js tests/github.test.js
git commit -m "feat: add GitHub PR details fetching for line stats"
```

---

### Task 2: Update GitHub Backfill to Include Line Stats

**Files:**
- Modify: `server.js` (update GitHub backfill section)

**Step 1: Update the GitHub backfill to fetch PR details**

In `server.js`, find the GitHub backfill section (around line 99-155). After fetching PRs and before grouping by date, add PR details fetching. Replace the section starting at `// Parse with comments` to include:

```javascript
        // Fetch detailed stats for merged PRs
        const mergedPRDetails = await github.fetchMergedPRsWithDetails(token, owner, repoName, prs);

        // Build lookup for PR line stats by author
        const prLinesByAuthor = {};
        for (const pr of mergedPRDetails) {
          if (!prLinesByAuthor[pr.author]) {
            prLinesByAuthor[pr.author] = { additions: 0, deletions: 0 };
          }
          prLinesByAuthor[pr.author].additions += pr.additions;
          prLinesByAuthor[pr.author].deletions += pr.deletions;
        }

        // Parse with comments
        const metrics = github.parsePRs(prs, allComments);
```

Then update the daily metric saving to include line stats:

```javascript
        for (const date of allDates) {
          const datePRs = byDate[date] || [];
          const dateComments = commentsByDate[date] || [];
          const dayMetrics = github.parsePRs(datePRs, dateComments);

          // Add line stats to byAuthor
          for (const author of Object.keys(dayMetrics.byAuthor)) {
            dayMetrics.byAuthor[author].prLinesAdded = prLinesByAuthor[author]?.additions || 0;
            dayMetrics.byAuthor[author].prLinesRemoved = prLinesByAuthor[author]?.deletions || 0;
          }

          // Calculate totals for line stats
          let totalPrLinesAdded = 0;
          let totalPrLinesRemoved = 0;
          for (const stats of Object.values(prLinesByAuthor)) {
            totalPrLinesAdded += stats.additions;
            totalPrLinesRemoved += stats.deletions;
          }

          await db.saveMetric('github', 'daily', date, {
            repo: `${owner}/${repoName}`,
            ...dayMetrics.totals,
            prLinesAdded: totalPrLinesAdded,
            prLinesRemoved: totalPrLinesRemoved,
            byAuthor: dayMetrics.byAuthor
          });
          count++;
        }
```

**Step 2: Verify tests pass**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: include PR line stats in GitHub backfill"
```

---

### Task 3: Add AI Metrics API Endpoint

**Files:**
- Modify: `server.js` (add new endpoint)
- Modify: `tests/server.test.js` (add tests)

**Step 1: Write the failing test**

Add to `tests/server.test.js` before the closing `});`:

```javascript
describe('GET /api/dashboard/ai-metrics', () => {
  it('returns ai metrics structure', async () => {
    const res = await request('GET', '/api/dashboard/ai-metrics?startDate=2025-01-01&endDate=2025-01-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('toolBreakdown');
    expect(res.body).toHaveProperty('byUser');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/server.test.js`
Expected: FAIL - 404

**Step 3: Add the ai-metrics endpoint**

Add before the identity mappings endpoints in `server.js` (around line 400):

```javascript
// AI Metrics endpoint - combined metrics from GitHub, Claude, Cursor
app.get('/api/dashboard/ai-metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const allMetrics = await db.getAllMetrics(start, end);
    const mappings = await db.getIdentityMappings();

    // Build email lookup from GitHub username
    const githubToEmail = {};
    for (const m of mappings) {
      githubToEmail[m.github_username.toLowerCase()] = m.email;
    }

    const githubMetrics = allMetrics.filter(m => m.source === 'github');
    const claudeMetrics = allMetrics.filter(m => m.source === 'claude');
    const cursorMetrics = allMetrics.filter(m => m.source === 'cursor');

    // Aggregate GitHub totals
    let totalPrLinesAdded = 0;
    let totalPrLinesRemoved = 0;
    let totalMergedCount = 0;
    let totalCycleTime = 0;
    let cycleTimeCount = 0;
    const githubByUser = {};

    for (const m of githubMetrics) {
      totalPrLinesAdded += m.data.prLinesAdded || 0;
      totalPrLinesRemoved += m.data.prLinesRemoved || 0;
      totalMergedCount += m.data.mergedCount || 0;
      if (m.data.avgCycleTimeHours) {
        totalCycleTime += m.data.avgCycleTimeHours;
        cycleTimeCount++;
      }

      if (m.data.byAuthor) {
        for (const [username, data] of Object.entries(m.data.byAuthor)) {
          const email = githubToEmail[username.toLowerCase()] || username;
          if (!githubByUser[email]) {
            githubByUser[email] = { prLinesAdded: 0, prLinesRemoved: 0, mergedCount: 0, totalCycleTime: 0 };
          }
          githubByUser[email].prLinesAdded += data.prLinesAdded || 0;
          githubByUser[email].prLinesRemoved += data.prLinesRemoved || 0;
          githubByUser[email].mergedCount += data.mergedCount || 0;
          githubByUser[email].totalCycleTime += data.totalCycleTime || 0;
        }
      }
    }

    // Aggregate Claude totals
    let claudeLinesAdded = 0;
    let claudeLinesRemoved = 0;
    let claudeSessions = 0;
    let claudeCostCents = 0;
    let claudePrsCreated = 0;
    let claudeEditAccepted = 0;
    let claudeEditRejected = 0;
    let claudeWriteAccepted = 0;
    let claudeWriteRejected = 0;
    const claudeByUser = {};

    for (const m of claudeMetrics) {
      const t = m.data.totals || {};
      claudeLinesAdded += t.linesAdded || 0;
      claudeLinesRemoved += t.linesRemoved || 0;
      claudeSessions += t.sessions || 0;
      claudeCostCents += t.costCents || 0;
      claudePrsCreated += t.prs || 0;
      claudeEditAccepted += t.editAccepted || 0;
      claudeEditRejected += t.editRejected || 0;
      claudeWriteAccepted += t.writeAccepted || 0;
      claudeWriteRejected += t.writeRejected || 0;

      if (m.data.users) {
        for (const [email, data] of Object.entries(m.data.users)) {
          if (!claudeByUser[email]) {
            claudeByUser[email] = { linesAdded: 0, linesRemoved: 0, sessions: 0, costCents: 0 };
          }
          claudeByUser[email].linesAdded += data.linesAdded || 0;
          claudeByUser[email].linesRemoved += data.linesRemoved || 0;
          claudeByUser[email].sessions += data.sessions || 0;
          claudeByUser[email].costCents += data.costCents || 0;
        }
      }
    }

    // Aggregate Cursor totals
    let cursorTotalLines = 0;
    let cursorAcceptedLines = 0;
    let cursorTabsShown = 0;
    let cursorTabsAccepted = 0;
    let cursorCostCents = 0;
    const cursorByUser = {};

    for (const m of cursorMetrics) {
      if (m.metric_type === 'daily' && m.data.totals) {
        cursorTotalLines += m.data.totals.totalLinesAdded || 0;
        cursorAcceptedLines += m.data.totals.acceptedLinesAdded || 0;
        cursorTabsShown += m.data.totals.totalTabsShown || 0;
        cursorTabsAccepted += m.data.totals.totalTabsAccepted || 0;
      }
      if (m.metric_type === 'spend') {
        cursorCostCents += m.data.totalSpendCents || 0;
        cursorCostCents += m.data.totalIncludedSpendCents || 0;
      }

      if (m.metric_type === 'daily' && m.data.byUser) {
        for (const [email, data] of Object.entries(m.data.byUser)) {
          if (!cursorByUser[email]) {
            cursorByUser[email] = { totalLines: 0, acceptedLines: 0, tabsShown: 0, tabsAccepted: 0, costCents: 0 };
          }
          cursorByUser[email].totalLines += data.totalLinesAdded || 0;
          cursorByUser[email].acceptedLines += data.acceptedLinesAdded || 0;
          cursorByUser[email].tabsShown += data.totalTabsShown || 0;
          cursorByUser[email].tabsAccepted += data.totalTabsAccepted || 0;
        }
      }
      if (m.metric_type === 'spend' && m.data.byUser) {
        for (const [email, data] of Object.entries(m.data.byUser)) {
          if (!cursorByUser[email]) {
            cursorByUser[email] = { totalLines: 0, acceptedLines: 0, tabsShown: 0, tabsAccepted: 0, costCents: 0 };
          }
          cursorByUser[email].costCents += (data.spendCents || 0) + (data.includedSpendCents || 0);
        }
      }
    }

    // Calculate derived metrics
    const editorLinesTotal = claudeLinesAdded + cursorTotalLines;
    const aiLinesTotal = claudeLinesAdded + cursorAcceptedLines; // Claude is 100% AI
    const aiShippedPercent = editorLinesTotal > 0 && totalPrLinesAdded > 0
      ? (totalPrLinesAdded * (aiLinesTotal / editorLinesTotal) / totalPrLinesAdded) * 100
      : 0;
    const aiAttributedPrPercent = totalMergedCount > 0
      ? (claudePrsCreated / totalMergedCount) * 100
      : 0;

    // Claude acceptance rate
    const claudeActions = claudeEditAccepted + claudeEditRejected + claudeWriteAccepted + claudeWriteRejected;
    const claudeAcceptanceRate = claudeActions > 0
      ? (claudeEditAccepted + claudeWriteAccepted) / claudeActions
      : 0;

    // Cursor acceptance rate
    const cursorAcceptanceRate = cursorTabsShown > 0
      ? cursorTabsAccepted / cursorTabsShown
      : 0;

    // Cursor AI percent
    const cursorAiPercent = cursorTotalLines > 0
      ? (cursorAcceptedLines / cursorTotalLines) * 100
      : 0;

    // Build per-user metrics
    const allEmails = new Set([
      ...Object.keys(githubByUser),
      ...Object.keys(claudeByUser),
      ...Object.keys(cursorByUser)
    ]);

    const byUser = {};
    for (const email of allEmails) {
      const gh = githubByUser[email] || {};
      const cl = claudeByUser[email] || {};
      const cu = cursorByUser[email] || {};

      const userEditorLines = (cl.linesAdded || 0) + (cu.totalLines || 0);
      const userAiLines = (cl.linesAdded || 0) + (cu.acceptedLines || 0);
      const userPrLines = gh.prLinesAdded || 0;

      byUser[email] = {
        prLinesAdded: userPrLines,
        prLinesRemoved: gh.prLinesRemoved || 0,
        mergedCount: gh.mergedCount || 0,
        avgCycleTimeHours: gh.mergedCount > 0 ? gh.totalCycleTime / gh.mergedCount : 0,
        aiShippedPercent: userEditorLines > 0 && userPrLines > 0
          ? (userAiLines / userEditorLines) * 100
          : 0,
        costCents: (cl.costCents || 0) + (cu.costCents || 0),
        claude: {
          linesAdded: cl.linesAdded || 0,
          linesRemoved: cl.linesRemoved || 0,
          sessions: cl.sessions || 0,
          costCents: cl.costCents || 0
        },
        cursor: {
          totalLines: cu.totalLines || 0,
          acceptedLines: cu.acceptedLines || 0,
          aiPercent: cu.totalLines > 0 ? (cu.acceptedLines / cu.totalLines) * 100 : 0,
          costCents: cu.costCents || 0
        }
      };
    }

    res.json({
      summary: {
        prLinesAdded: totalPrLinesAdded,
        prLinesRemoved: totalPrLinesRemoved,
        mergedCount: totalMergedCount,
        avgCycleTimeHours: cycleTimeCount > 0 ? totalCycleTime / cycleTimeCount : 0,
        aiShippedPercent,
        aiAttributedPrPercent,
        costCents: claudeCostCents + cursorCostCents
      },
      toolBreakdown: {
        claude: {
          linesAdded: claudeLinesAdded,
          linesRemoved: claudeLinesRemoved,
          sessions: claudeSessions,
          acceptanceRate: claudeAcceptanceRate,
          costCents: claudeCostCents,
          prsCreated: claudePrsCreated
        },
        cursor: {
          totalLinesAdded: cursorTotalLines,
          acceptedLinesAdded: cursorAcceptedLines,
          aiPercent: cursorAiPercent,
          acceptanceRate: cursorAcceptanceRate,
          costCents: cursorCostCents
        }
      },
      byUser
    });
  } catch (err) {
    console.error('Error generating AI metrics:', err);
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
git commit -m "feat: add AI metrics API endpoint"
```

---

### Task 4: Add AI Metrics Tab HTML

**Files:**
- Modify: `public/index.html`

**Step 1: Add AI Metrics tab button**

Find the tab-bar div and add the AI Metrics button:

```html
    <div class="tab-bar">
      <button class="tab active" data-tab="dashboard">Dashboard</button>
      <button class="tab" data-tab="ai-metrics">AI Metrics</button>
      <button class="tab" data-tab="mappings">Identity Mappings</button>
    </div>
```

**Step 2: Add AI Metrics tab content**

Add after the `</div><!-- end dashboard-tab -->` and before the mappings-tab:

```html
    <div id="ai-metrics-tab" class="tab-content">
      <div class="controls">
        <label>From: <input type="date" id="aiMetricsStartDate"></label>
        <label>To: <input type="date" id="aiMetricsEndDate"></label>
        <button onclick="loadAiMetrics()">Refresh</button>
      </div>

      <h2>Summary</h2>
      <div class="metrics-grid" id="aiSummaryCards">
        <div class="metric-card">
          <h3>Lines Shipped</h3>
          <div class="value" id="aiLinesShipped">--</div>
          <div class="label">merged PR lines</div>
        </div>
        <div class="metric-card">
          <h3>Lines Removed</h3>
          <div class="value" id="aiLinesRemoved">--</div>
          <div class="label">merged PR deletions</div>
        </div>
        <div class="metric-card">
          <h3>Merged PRs</h3>
          <div class="value" id="aiMergedPrs">--</div>
          <div class="label">pull requests</div>
        </div>
        <div class="metric-card">
          <h3>Cycle Time</h3>
          <div class="value" id="aiCycleTime">--</div>
          <div class="label">avg hours</div>
        </div>
        <div class="metric-card">
          <h3>AI % (est)</h3>
          <div class="value" id="aiShippedPercent">--</div>
          <div class="label">of shipped code</div>
        </div>
        <div class="metric-card">
          <h3>AI PRs (proven)</h3>
          <div class="value" id="aiAttributedPrPercent">--</div>
          <div class="label">with AI attribution</div>
        </div>
        <div class="metric-card">
          <h3>Total Cost</h3>
          <div class="value" id="aiTotalCost">--</div>
          <div class="label">AI tools spend</div>
        </div>
      </div>

      <h2>Tool Breakdown</h2>
      <div class="tool-cards">
        <div class="tool-card claude">
          <h3>Claude Code</h3>
          <div class="tool-stats">
            <div><span class="stat-label">Lines:</span> <span id="claudeLines">--</span></div>
            <div><span class="stat-label">Sessions:</span> <span id="claudeSessions">--</span></div>
            <div><span class="stat-label">Accept Rate:</span> <span id="claudeAcceptRate">--</span></div>
            <div><span class="stat-label">Cost:</span> <span id="claudeCost">--</span></div>
            <div><span class="stat-label">PRs Created:</span> <span id="claudePrsCreated">--</span></div>
          </div>
        </div>
        <div class="tool-card cursor">
          <h3>Cursor</h3>
          <div class="tool-stats">
            <div><span class="stat-label">Lines:</span> <span id="cursorLines">--</span></div>
            <div><span class="stat-label">AI %:</span> <span id="cursorAiPercent">--</span></div>
            <div><span class="stat-label">Accept Rate:</span> <span id="cursorAcceptRate">--</span></div>
            <div><span class="stat-label">Cost:</span> <span id="cursorCost">--</span></div>
          </div>
        </div>
      </div>

      <h2>Developer Breakdown</h2>
      <div class="table-scroll">
        <table class="team-table" id="aiUserTable">
          <thead>
            <tr>
              <th>User</th>
              <th>Lines Shipped</th>
              <th>AI %</th>
              <th>PRs</th>
              <th>Cost</th>
              <th>Cycle Time</th>
            </tr>
          </thead>
          <tbody id="aiUserTableBody">
            <tr><td colspan="6">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
```

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add AI Metrics tab HTML structure"
```

---

### Task 5: Add AI Metrics Tab CSS

**Files:**
- Modify: `public/style.css`

**Step 1: Add tool card styles**

Add to the end of `public/style.css`:

```css
/* Tool Breakdown Cards */
.tool-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.tool-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.tool-card h3 {
  font-size: 14px;
  color: #2c3e50;
  margin-bottom: 15px;
  text-transform: uppercase;
}

.tool-card.claude {
  border-left: 4px solid #c96442;
}

.tool-card.cursor {
  border-left: 4px solid #00d1b2;
}

.tool-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-stats div {
  display: flex;
  justify-content: space-between;
}

.stat-label {
  color: #7f8c8d;
  font-size: 14px;
}

.tool-stats span:not(.stat-label) {
  font-weight: 600;
  color: #2c3e50;
}

/* Expandable rows */
.expandable-row {
  cursor: pointer;
}

.expandable-row:hover {
  background: #f0f4f8;
}

.expand-icon {
  display: inline-block;
  width: 20px;
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.expanded-content {
  background: #f8f9fa;
}

.expanded-content td {
  padding: 15px;
}

.tool-detail {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.tool-detail-section h4 {
  font-size: 12px;
  color: #7f8c8d;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.tool-detail-section div {
  font-size: 13px;
  margin-bottom: 5px;
}
```

**Step 2: Commit**

```bash
git add public/style.css
git commit -m "feat: add AI Metrics tab CSS styles"
```

---

### Task 6: Add AI Metrics Tab JavaScript

**Files:**
- Modify: `public/app.js`

**Step 1: Initialize date inputs**

Add after the existing date initialization (around line 8):

```javascript
document.getElementById('aiMetricsStartDate').value = thirtyDaysAgo;
document.getElementById('aiMetricsEndDate').value = today;
```

**Step 2: Update tab switching to load AI metrics**

Find the tab switching code and add AI metrics loading:

```javascript
    // Load data when switching tabs
    if (tab.dataset.tab === 'mappings') {
      loadMappings();
    } else if (tab.dataset.tab === 'ai-metrics') {
      loadAiMetrics();
    }
```

**Step 3: Add loadAiMetrics function**

Add after the loadMappings function:

```javascript
async function loadAiMetrics() {
  const startDate = document.getElementById('aiMetricsStartDate').value;
  const endDate = document.getElementById('aiMetricsEndDate').value;

  try {
    const res = await fetch(`/api/dashboard/ai-metrics?startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load AI metrics');
    }

    // Summary cards
    document.getElementById('aiLinesShipped').textContent = data.summary.prLinesAdded.toLocaleString();
    document.getElementById('aiLinesRemoved').textContent = data.summary.prLinesRemoved.toLocaleString();
    document.getElementById('aiMergedPrs').textContent = data.summary.mergedCount;
    document.getElementById('aiCycleTime').textContent = data.summary.avgCycleTimeHours.toFixed(1);
    document.getElementById('aiShippedPercent').textContent = data.summary.aiShippedPercent.toFixed(1) + '%';
    document.getElementById('aiAttributedPrPercent').textContent = data.summary.aiAttributedPrPercent.toFixed(1) + '%';
    document.getElementById('aiTotalCost').textContent = '$' + (data.summary.costCents / 100).toFixed(2);

    // Tool breakdown - Claude
    const claude = data.toolBreakdown.claude;
    document.getElementById('claudeLines').textContent = claude.linesAdded.toLocaleString();
    document.getElementById('claudeSessions').textContent = claude.sessions;
    document.getElementById('claudeAcceptRate').textContent = (claude.acceptanceRate * 100).toFixed(1) + '%';
    document.getElementById('claudeCost').textContent = '$' + (claude.costCents / 100).toFixed(2);
    document.getElementById('claudePrsCreated').textContent = claude.prsCreated;

    // Tool breakdown - Cursor
    const cursor = data.toolBreakdown.cursor;
    document.getElementById('cursorLines').textContent = cursor.totalLinesAdded.toLocaleString() + ' (' + cursor.aiPercent.toFixed(0) + '% AI)';
    document.getElementById('cursorAiPercent').textContent = cursor.aiPercent.toFixed(1) + '%';
    document.getElementById('cursorAcceptRate').textContent = (cursor.acceptanceRate * 100).toFixed(1) + '%';
    document.getElementById('cursorCost').textContent = '$' + (cursor.costCents / 100).toFixed(2);

    // User table
    renderAiUserTable(data.byUser);
  } catch (err) {
    console.error('Failed to load AI metrics:', err);
  }
}

function renderAiUserTable(byUser) {
  const tbody = document.getElementById('aiUserTableBody');
  const users = Object.entries(byUser).sort((a, b) => b[1].prLinesAdded - a[1].prLinesAdded);

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No data available</td></tr>';
    return;
  }

  const formatCycleTime = (hours) => {
    if (!hours) return '--';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  tbody.innerHTML = users.map(([email, user]) => `
    <tr class="expandable-row" onclick="toggleAiUserExpand('${escapeHtml(email)}')">
      <td><span class="expand-icon" id="expand-${escapeHtml(email)}">▶</span> ${escapeHtml(email)}</td>
      <td>${user.prLinesAdded.toLocaleString()}</td>
      <td>${user.aiShippedPercent.toFixed(1)}%</td>
      <td>${user.mergedCount}</td>
      <td>$${(user.costCents / 100).toFixed(2)}</td>
      <td>${formatCycleTime(user.avgCycleTimeHours)}</td>
    </tr>
    <tr class="expanded-content" id="detail-${escapeHtml(email)}" style="display: none;">
      <td colspan="6">
        <div class="tool-detail">
          <div class="tool-detail-section">
            <h4>Claude Code</h4>
            <div>Lines: ${user.claude.linesAdded.toLocaleString()}</div>
            <div>Sessions: ${user.claude.sessions}</div>
            <div>Cost: $${(user.claude.costCents / 100).toFixed(2)}</div>
          </div>
          <div class="tool-detail-section">
            <h4>Cursor</h4>
            <div>Lines: ${user.cursor.totalLines.toLocaleString()} (${user.cursor.aiPercent.toFixed(0)}% AI)</div>
            <div>AI Lines: ${user.cursor.acceptedLines.toLocaleString()}</div>
            <div>Cost: $${(user.cursor.costCents / 100).toFixed(2)}</div>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function toggleAiUserExpand(email) {
  const icon = document.getElementById(`expand-${email}`);
  const detail = document.getElementById(`detail-${email}`);

  if (detail.style.display === 'none') {
    detail.style.display = 'table-row';
    icon.classList.add('expanded');
  } else {
    detail.style.display = 'none';
    icon.classList.remove('expanded');
  }
}
```

**Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: add AI Metrics tab JavaScript functionality"
```

---

### Task 7: Final Testing

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual verification**

1. Start server: `npm start`
2. Open http://localhost:3000
3. Click "AI Metrics" tab
4. Verify summary cards show data
5. Verify tool breakdown shows Claude and Cursor stats
6. Verify user table shows per-user metrics
7. Click a user row to expand tool detail

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete AI Metrics tab implementation"
```

---

## Summary

This implementation adds:
1. GitHub PR line stats fetching for merged PRs
2. Enhanced GitHub backfill with line stats per author
3. New `/api/dashboard/ai-metrics` endpoint with combined metrics
4. AI Metrics tab with summary cards, tool breakdown, and expandable user table
5. Derived metrics: aiShippedPercent, aiAttributedPrPercent
