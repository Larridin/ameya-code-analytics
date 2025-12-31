# Identity Mappings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email-to-GitHub-username mapping so dashboard shows unified user data by email.

**Architecture:** New `identity_mappings` table stores email↔GitHub username pairs. Team view endpoint uses mappings to convert GitHub usernames to emails. Frontend adds tab navigation with a dedicated mappings management UI.

**Tech Stack:** Express.js, PostgreSQL, vanilla JavaScript, Jest

---

### Task 1: Add Database Table and CRUD Functions

**Files:**
- Modify: `schema.sql:17` (add after metrics table)
- Modify: `lib/db.js:58` (add new functions)
- Modify: `tests/db.test.js:46` (add tests)

**Step 1: Write the failing test**

Add to `tests/db.test.js` before the closing `});`:

```javascript
describe('identity mappings', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM identity_mappings WHERE email LIKE 'test%'");
  });

  it('saves and retrieves a mapping', async () => {
    const { saveIdentityMapping, getIdentityMappings } = require('../lib/db');
    await saveIdentityMapping('test@example.com', 'testuser');
    const mappings = await getIdentityMappings();
    const mapping = mappings.find(m => m.email === 'test@example.com');
    expect(mapping.github_username).toBe('testuser');
  });

  it('deletes a mapping', async () => {
    const { saveIdentityMapping, deleteIdentityMapping, getIdentityMappings } = require('../lib/db');
    await saveIdentityMapping('test-delete@example.com', 'deleteuser');
    await deleteIdentityMapping('test-delete@example.com');
    const mappings = await getIdentityMappings();
    const mapping = mappings.find(m => m.email === 'test-delete@example.com');
    expect(mapping).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.test.js`
Expected: FAIL - table does not exist / functions not defined

**Step 3: Add the database table**

Add to `schema.sql` after line 17:

```sql
CREATE TABLE IF NOT EXISTS identity_mappings (
    email VARCHAR(255) PRIMARY KEY,
    github_username VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Step 4: Run the migration**

Run: `psql -d code_analytics -c "CREATE TABLE IF NOT EXISTS identity_mappings (email VARCHAR(255) PRIMARY KEY, github_username VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());"`

**Step 5: Add CRUD functions to db.js**

Add to `lib/db.js` before the `module.exports`:

```javascript
async function getIdentityMappings() {
  const result = await pool.query(
    'SELECT email, github_username, created_at, updated_at FROM identity_mappings ORDER BY email'
  );
  return result.rows;
}

async function saveIdentityMapping(email, githubUsername) {
  const result = await pool.query(
    `INSERT INTO identity_mappings (email, github_username, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email)
     DO UPDATE SET github_username = $2, updated_at = NOW()
     RETURNING *`,
    [email, githubUsername]
  );
  return result.rows[0];
}

async function deleteIdentityMapping(email) {
  await pool.query('DELETE FROM identity_mappings WHERE email = $1', [email]);
}
```

**Step 6: Update module.exports**

Change `module.exports` in `lib/db.js` to:

```javascript
module.exports = { pool, saveMetric, getMetrics, getAllMetrics, saveConfig, getConfig, getIdentityMappings, saveIdentityMapping, deleteIdentityMapping };
```

**Step 7: Run test to verify it passes**

Run: `npm test -- tests/db.test.js`
Expected: PASS

**Step 8: Commit**

```bash
git add schema.sql lib/db.js tests/db.test.js
git commit -m "feat: add identity_mappings table and CRUD functions"
```

---

### Task 2: Add API Endpoints

**Files:**
- Modify: `server.js:373` (add before PORT declaration)
- Modify: `tests/server.test.js:61` (add tests)

**Step 1: Write the failing test**

Add to `tests/server.test.js` before the closing `});`:

```javascript
describe('Identity Mappings API', () => {
  const testEmail = 'api-test@example.com';
  const testUsername = 'api-test-user';

  afterAll(async () => {
    await request('DELETE', `/api/identity-mappings/${encodeURIComponent(testEmail)}`);
  });

  it('POST creates a mapping', async () => {
    const res = await request('POST', '/api/identity-mappings', {
      email: testEmail,
      githubUsername: testUsername
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  it('GET returns all mappings', async () => {
    const res = await request('GET', '/api/identity-mappings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('DELETE removes a mapping', async () => {
    const res = await request('DELETE', `/api/identity-mappings/${encodeURIComponent(testEmail)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/server.test.js`
Expected: FAIL - 404 not found

**Step 3: Add API endpoints to server.js**

Add before the `const PORT` line in `server.js`:

```javascript
// Identity mappings endpoints
app.get('/api/identity-mappings', async (req, res) => {
  try {
    const mappings = await db.getIdentityMappings();
    res.json(mappings);
  } catch (err) {
    console.error('Error fetching identity mappings:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/identity-mappings', async (req, res) => {
  try {
    const { email, githubUsername } = req.body;
    if (!email || !githubUsername) {
      return res.status(400).json({ error: 'email and githubUsername are required' });
    }
    const mapping = await db.saveIdentityMapping(email, githubUsername);
    res.json(mapping);
  } catch (err) {
    console.error('Error saving identity mapping:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/identity-mappings/:email', async (req, res) => {
  try {
    const { email } = req.params;
    await db.deleteIdentityMapping(email);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting identity mapping:', err);
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
git commit -m "feat: add identity mappings API endpoints"
```

---

### Task 3: Update Team View to Use Mappings

**Files:**
- Modify: `server.js:224-348` (update /api/dashboard/team endpoint)

**Step 1: Update the team endpoint**

Replace the `/api/dashboard/team` endpoint handler (lines 224-348) with:

```javascript
// Team view endpoint - per-user metrics
app.get('/api/dashboard/team', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const allMetrics = await db.getAllMetrics(start, end);
    const cursorMetrics = allMetrics.filter(m => m.source === 'cursor');
    const claudeMetrics = allMetrics.filter(m => m.source === 'claude');
    const githubMetrics = allMetrics.filter(m => m.source === 'github');

    // Load identity mappings (github_username -> email)
    const mappings = await db.getIdentityMappings();
    const githubToEmail = {};
    for (const m of mappings) {
      githubToEmail[m.github_username.toLowerCase()] = m.email;
    }

    // Initialize user map with default values
    const userMap = {};
    const unmappedGithubUsers = new Set();

    const initUser = (identifier) => {
      if (!userMap[identifier]) {
        userMap[identifier] = {
          identifier,
          // Cursor metrics
          cursorLinesAdded: 0,
          cursorAcceptedLines: 0,
          cursorTabsShown: 0,
          cursorTabsAccepted: 0,
          cursorRequests: 0,
          cursorSpendDollars: 0,
          cursorIncludedSpendDollars: 0,
          // Claude metrics
          claudeSessions: 0,
          claudeLinesAdded: 0,
          claudeLinesRemoved: 0,
          claudeCostDollars: 0,
          // GitHub metrics
          githubPrCount: 0,
          githubMergedCount: 0,
          githubAvgCycleTimeHours: 0,
          githubTotalCycleTime: 0,
          githubCommentsReceived: 0,
          githubCommentsMade: 0,
          // Status
          isActive: false,
          isUnmapped: false
        };
      }
    };

    // Process Cursor daily metrics
    for (const m of cursorMetrics) {
      if (m.metric_type === 'daily' && m.data.byUser) {
        for (const email of Object.keys(m.data.byUser)) {
          initUser(email);
        }
      }
      if (m.metric_type === 'spend' && m.data.byUser) {
        for (const [email, spendData] of Object.entries(m.data.byUser)) {
          initUser(email);
          userMap[email].cursorSpendDollars = spendData.spendDollars || 0;
          userMap[email].cursorIncludedSpendDollars = spendData.includedSpendDollars || 0;
        }
      }
    }

    // Use the latest Cursor daily metric for usage data
    const latestCursorDaily = cursorMetrics
      .filter(m => m.metric_type === 'daily')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    if (latestCursorDaily?.data?.byUser) {
      for (const [email, userData] of Object.entries(latestCursorDaily.data.byUser)) {
        initUser(email);
        userMap[email].cursorLinesAdded = userData.totalLinesAdded || 0;
        userMap[email].cursorAcceptedLines = userData.acceptedLinesAdded || 0;
        userMap[email].cursorTabsShown = userData.totalTabsShown || 0;
        userMap[email].cursorTabsAccepted = userData.totalTabsAccepted || 0;
        userMap[email].cursorRequests = userData.requests || 0;
        if (userData.isActive) userMap[email].isActive = true;
      }
    }

    // Process Claude metrics - aggregate across all days
    for (const m of claudeMetrics) {
      if (m.data.users) {
        for (const [email, userData] of Object.entries(m.data.users)) {
          initUser(email);
          userMap[email].claudeSessions += userData.sessions || 0;
          userMap[email].claudeLinesAdded += userData.linesAdded || 0;
          userMap[email].claudeLinesRemoved += userData.linesRemoved || 0;
          userMap[email].claudeCostDollars += (userData.costCents || 0) / 100;
        }
      }
    }

    // Process GitHub metrics - map username to email
    for (const m of githubMetrics) {
      if (m.data.byAuthor) {
        for (const [username, authorData] of Object.entries(m.data.byAuthor)) {
          const email = githubToEmail[username.toLowerCase()];
          if (email) {
            // Mapped user - add to email-based entry
            initUser(email);
            userMap[email].githubPrCount += authorData.prCount || 0;
            userMap[email].githubMergedCount += authorData.mergedCount || 0;
            userMap[email].githubTotalCycleTime += authorData.totalCycleTime || 0;
            userMap[email].githubCommentsReceived += authorData.commentsReceived || 0;
            userMap[email].githubCommentsMade += authorData.commentsMade || 0;
          } else {
            // Unmapped user - show with username
            initUser(username);
            userMap[username].isUnmapped = true;
            userMap[username].githubPrCount += authorData.prCount || 0;
            userMap[username].githubMergedCount += authorData.mergedCount || 0;
            userMap[username].githubTotalCycleTime += authorData.totalCycleTime || 0;
            userMap[username].githubCommentsReceived += authorData.commentsReceived || 0;
            userMap[username].githubCommentsMade += authorData.commentsMade || 0;
          }
        }
      }
    }

    // Calculate derived metrics and format response
    const users = Object.values(userMap).map(u => ({
      ...u,
      cursorAiCodePercent: u.cursorLinesAdded > 0
        ? (u.cursorAcceptedLines / u.cursorLinesAdded) * 100
        : 0,
      cursorTabAcceptRate: u.cursorTabsShown > 0
        ? (u.cursorTabsAccepted / u.cursorTabsShown) * 100
        : 0,
      cursorTotalUsageDollars: u.cursorSpendDollars + u.cursorIncludedSpendDollars,
      githubAvgCycleTimeHours: u.githubMergedCount > 0
        ? u.githubTotalCycleTime / u.githubMergedCount
        : 0,
      totalLinesAdded: u.cursorLinesAdded + u.claudeLinesAdded,
      totalCostDollars: u.cursorSpendDollars + u.cursorIncludedSpendDollars + u.claudeCostDollars
    }))
    // Sort: mapped users first (by lines), then unmapped users
    .sort((a, b) => {
      if (a.isUnmapped !== b.isUnmapped) return a.isUnmapped ? 1 : -1;
      return b.totalLinesAdded - a.totalLinesAdded;
    });

    res.json({ users });
  } catch (err) {
    console.error('Error generating team view:', err);
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Verify existing tests pass**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: team view uses identity mappings for GitHub users"
```

---

### Task 4: Add Tab Navigation UI

**Files:**
- Modify: `public/index.html:10-17` (add tab bar after h1)
- Modify: `public/style.css:156` (add tab styles)

**Step 1: Add tab bar HTML**

In `public/index.html`, replace lines 10-17 (the h1 and controls div) with:

```html
    <h1>Code Analytics Dashboard</h1>

    <div class="tab-bar">
      <button class="tab active" data-tab="dashboard">Dashboard</button>
      <button class="tab" data-tab="mappings">Identity Mappings</button>
    </div>

    <div id="dashboard-tab" class="tab-content active">
      <div class="controls">
        <label>From: <input type="date" id="startDate"></label>
        <label>To: <input type="date" id="endDate"></label>
        <button onclick="loadDashboard()">Refresh</button>
      </div>
```

**Step 2: Wrap existing content and add mappings tab**

After the backfill section closing `</div>` (around line 109), add:

```html
    </div><!-- end dashboard-tab -->

    <div id="mappings-tab" class="tab-content">
      <div class="section">
        <h2>Add New Mapping</h2>
        <div class="mapping-form">
          <input type="email" id="mappingEmail" placeholder="Email address" required>
          <input type="text" id="mappingGithub" placeholder="GitHub username" required>
          <button onclick="addMapping()">Add Mapping</button>
        </div>
        <div id="mappingStatus"></div>
      </div>

      <div class="section">
        <h2>Current Mappings</h2>
        <table class="mappings-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>GitHub Username</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="mappingsTableBody">
            <tr><td colspan="3">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
```

**Step 3: Add tab styles**

Add to the end of `public/style.css`:

```css
/* Tab Navigation */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border-bottom: 2px solid #ddd;
}

.tab {
  padding: 12px 24px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: #7f8c8d;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tab:hover {
  color: #2c3e50;
}

.tab.active {
  color: #3498db;
  border-bottom-color: #3498db;
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

/* Mappings Tab */
.mapping-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mapping-form input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
}

.mapping-form button {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.mapping-form button:hover {
  background: #2980b9;
}

.mappings-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.mappings-table th,
.mappings-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.mappings-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  font-size: 12px;
  text-transform: uppercase;
}

.mappings-table tr:hover {
  background: #f8f9fa;
}

.mappings-table .delete-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.mappings-table .delete-btn:hover {
  background: #c0392b;
}

/* Unmapped user indicator */
.unmapped-indicator {
  color: #f39c12;
  cursor: pointer;
  margin-right: 5px;
}

.unmapped-indicator:hover {
  color: #e67e22;
}

.user-unmapped {
  background: #fef9e7;
}
```

**Step 4: Verify files render correctly**

Run: `npm start`
Open: http://localhost:3000
Expected: See tab bar with Dashboard and Identity Mappings tabs

**Step 5: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: add tab navigation and mappings tab UI"
```

---

### Task 5: Add Frontend JavaScript for Mappings

**Files:**
- Modify: `public/app.js:124` (add tab switching and mappings functions)

**Step 1: Add tab switching and mappings logic**

Add to the end of `public/app.js`:

```javascript
// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tab.dataset.tab + '-tab').classList.add('active');

    // Load mappings when switching to that tab
    if (tab.dataset.tab === 'mappings') {
      loadMappings();
    }
  });
});

// Mappings management
async function loadMappings() {
  try {
    const res = await fetch('/api/identity-mappings');
    const mappings = await res.json();

    const tbody = document.getElementById('mappingsTableBody');

    if (mappings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">No mappings configured</td></tr>';
      return;
    }

    tbody.innerHTML = mappings.map(m => `
      <tr>
        <td>${m.email}</td>
        <td>${m.github_username}</td>
        <td>
          <button class="delete-btn" onclick="deleteMapping('${m.email}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load mappings:', err);
    document.getElementById('mappingsTableBody').innerHTML =
      '<tr><td colspan="3">Error loading mappings</td></tr>';
  }
}

async function addMapping() {
  const email = document.getElementById('mappingEmail').value.trim();
  const githubUsername = document.getElementById('mappingGithub').value.trim();
  const statusEl = document.getElementById('mappingStatus');

  if (!email || !githubUsername) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Both email and GitHub username are required';
    return;
  }

  try {
    const res = await fetch('/api/identity-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, githubUsername })
    });

    const data = await res.json();

    if (res.ok) {
      statusEl.className = 'status success';
      statusEl.textContent = 'Mapping added successfully';
      document.getElementById('mappingEmail').value = '';
      document.getElementById('mappingGithub').value = '';
      loadMappings();
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + data.error;
    }
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Error: ' + err.message;
  }
}

async function deleteMapping(email) {
  if (!confirm(`Delete mapping for ${email}?`)) return;

  try {
    const res = await fetch(`/api/identity-mappings/${encodeURIComponent(email)}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      loadMappings();
    } else {
      const data = await res.json();
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Pre-fill mapping form from URL params (for unmapped user click)
function prefillMappingForm(githubUsername) {
  document.querySelector('[data-tab="mappings"]').click();
  document.getElementById('mappingGithub').value = githubUsername;
  document.getElementById('mappingEmail').focus();
}
```

**Step 2: Verify mappings tab works**

Run: `npm start`
Open: http://localhost:3000
Test: Click "Identity Mappings" tab, add a mapping, verify it appears in table, delete it

**Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add frontend logic for identity mappings CRUD"
```

---

### Task 6: Add Unmapped User Indicator to Team View

**Files:**
- Modify: `public/app.js:66-83` (update loadTeamView function)

**Step 1: Update the team table row rendering**

In `public/app.js`, replace the `tbody.innerHTML = data.users.map(...)` block (around line 66-83) with:

```javascript
    tbody.innerHTML = data.users.map(user => {
      const rowClass = user.isUnmapped ? 'user-unmapped' : '';
      const userCell = user.isUnmapped
        ? `<span class="unmapped-indicator" onclick="prefillMappingForm('${user.identifier}')" title="Click to add mapping">⚠️</span>${user.identifier}`
        : user.identifier;

      return `
        <tr class="${rowClass}">
          <td>${userCell}</td>
          <td>${user.githubPrCount || '--'}</td>
          <td>${formatCycleTime(user.githubAvgCycleTimeHours)}</td>
          <td>${user.githubCommentsReceived || '--'}</td>
          <td>${user.githubCommentsMade || '--'}</td>
          <td>${user.cursorLinesAdded.toLocaleString()}</td>
          <td>${user.cursorAiCodePercent.toFixed(1)}%</td>
          <td>${user.cursorTabAcceptRate.toFixed(1)}%</td>
          <td>${user.cursorRequests}</td>
          <td>$${user.cursorTotalUsageDollars.toFixed(2)}</td>
          <td>${user.claudeSessions}</td>
          <td>${user.claudeLinesAdded.toLocaleString()}</td>
          <td>$${user.claudeCostDollars.toFixed(2)}</td>
          <td>$${user.totalCostDollars.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
```

**Step 2: Verify unmapped users display correctly**

Run: `npm start`
Open: http://localhost:3000
Expected: GitHub-only users show with ⚠️ indicator, clicking navigates to mappings tab with username pre-filled

**Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add unmapped user indicator with click-to-map"
```

---

### Task 7: Final Testing and Cleanup

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual end-to-end test**

1. Start server: `npm start`
2. Open http://localhost:3000
3. Verify Dashboard tab shows metrics
4. Click Identity Mappings tab
5. Add a mapping (e.g., alice@example.com → alice-gh)
6. Verify it appears in the table
7. Go back to Dashboard, verify team view updates
8. Delete the mapping
9. Verify unmapped indicator appears for GitHub users

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete identity mappings feature"
```

---

## Summary

This implementation adds:
1. Database table and CRUD for email↔GitHub mappings
2. REST API endpoints for mappings management
3. Team view integration (GitHub usernames → emails)
4. Tab-based navigation with dedicated mappings UI
5. Unmapped user indicator with click-to-map functionality
