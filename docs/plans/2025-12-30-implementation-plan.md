# Code Analytics Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified dashboard to track developer productivity across GitHub, Cursor, and Claude Code with explicit data backfill.

**Architecture:** Express server with three API clients fetching data into PostgreSQL. Frontend reads from Postgres only. Backfill endpoint triggers data ingestion.

**Tech Stack:** Node.js, Express, pg (postgres), Chart.js, vanilla HTML/JS

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```bash
cd /Users/ameya/dev/exp/code-analytics
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install express pg dotenv
npm install --save-dev jest
```

**Step 3: Create .env.example**

```env
# Database
DATABASE_URL=postgresql://localhost:5432/code_analytics

# GitHub
GITHUB_TOKEN=ghp_...

# Cursor (Enterprise)
CURSOR_API_KEY=...

# Claude Code Admin
CLAUDE_ADMIN_KEY=sk-ant-admin...

# Server
PORT=3000
```

**Step 4: Create .gitignore**

```
node_modules/
.env
*.log
```

**Step 5: Update package.json scripts**

Add to package.json:
```json
{
  "scripts": {
    "start": "node server.js",
    "test": "jest --verbose"
  }
}
```

**Step 6: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: initialize project with dependencies"
```

---

## Task 2: Database Schema

**Files:**
- Create: `schema.sql`
- Create: `lib/db.js`
- Create: `tests/db.test.js`

**Step 1: Create schema.sql**

```sql
-- Run with: psql -d code_analytics -f schema.sql

CREATE TABLE IF NOT EXISTS config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, metric_type, date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_lookup
ON metrics(source, metric_type, date);
```

**Step 2: Create the database locally**

```bash
createdb code_analytics
psql -d code_analytics -f schema.sql
```

**Step 3: Write failing test for db.js**

Create `tests/db.test.js`:
```javascript
const { pool, saveMetric, getMetrics, saveConfig, getConfig } = require('../lib/db');

describe('db', () => {
  beforeAll(async () => {
    // Clean test data
    await pool.query("DELETE FROM metrics WHERE source = 'test'");
    await pool.query("DELETE FROM config WHERE key LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('saveMetric', () => {
    it('saves a metric to the database', async () => {
      const result = await saveMetric('test', 'test_metric', '2025-01-01', { value: 42 });
      expect(result.source).toBe('test');
      expect(result.data.value).toBe(42);
    });

    it('upserts on conflict', async () => {
      await saveMetric('test', 'test_metric', '2025-01-01', { value: 100 });
      const metrics = await getMetrics('test', 'test_metric', '2025-01-01', '2025-01-01');
      expect(metrics[0].data.value).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('returns metrics for date range', async () => {
      await saveMetric('test', 'range_test', '2025-01-01', { day: 1 });
      await saveMetric('test', 'range_test', '2025-01-02', { day: 2 });
      await saveMetric('test', 'range_test', '2025-01-03', { day: 3 });

      const metrics = await getMetrics('test', 'range_test', '2025-01-01', '2025-01-02');
      expect(metrics.length).toBe(2);
    });
  });

  describe('config', () => {
    it('saves and retrieves config', async () => {
      await saveConfig('test_key', 'test_value');
      const value = await getConfig('test_key');
      expect(value).toBe('test_value');
    });
  });
});
```

**Step 4: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 5: Implement lib/db.js**

Create `lib/db.js`:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/code_analytics'
});

async function saveMetric(source, metricType, date, data) {
  const result = await pool.query(
    `INSERT INTO metrics (source, metric_type, date, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, metric_type, date)
     DO UPDATE SET data = $4, created_at = NOW()
     RETURNING *`,
    [source, metricType, date, JSON.stringify(data)]
  );
  return result.rows[0];
}

async function getMetrics(source, metricType, startDate, endDate) {
  const result = await pool.query(
    `SELECT * FROM metrics
     WHERE source = $1 AND metric_type = $2
     AND date >= $3 AND date <= $4
     ORDER BY date`,
    [source, metricType, startDate, endDate]
  );
  return result.rows;
}

async function getAllMetrics(startDate, endDate) {
  const result = await pool.query(
    `SELECT * FROM metrics
     WHERE date >= $1 AND date <= $2
     ORDER BY source, metric_type, date`,
    [startDate, endDate]
  );
  return result.rows;
}

async function saveConfig(key, value) {
  await pool.query(
    `INSERT INTO config (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

async function getConfig(key) {
  const result = await pool.query(
    'SELECT value FROM config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

module.exports = { pool, saveMetric, getMetrics, getAllMetrics, saveConfig, getConfig };
```

**Step 6: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 7: Commit**

```bash
git add schema.sql lib/db.js tests/db.test.js
git commit -m "feat: add database schema and db module"
```

---

## Task 3: Claude Code API Client

**Files:**
- Create: `lib/claude.js`
- Create: `tests/claude.test.js`

**Step 1: Write failing test**

Create `tests/claude.test.js`:
```javascript
const { fetchClaudeMetrics, parseClaudeResponse } = require('../lib/claude');

describe('claude', () => {
  describe('parseClaudeResponse', () => {
    it('parses API response into metrics', () => {
      const response = {
        data: [
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev@test.com' },
            terminal_type: 'vscode',
            core_metrics: {
              num_sessions: 5,
              lines_of_code: { added: 100, removed: 50 },
              commits_by_claude_code: 2,
              pull_requests_by_claude_code: 1
            },
            tool_actions: {
              edit_tool: { accepted: 10, rejected: 2 },
              write_tool: { accepted: 5, rejected: 1 },
              notebook_edit_tool: { accepted: 0, rejected: 0 }
            },
            model_breakdown: [
              {
                model: 'claude-sonnet-4',
                tokens: { input: 1000, output: 500, cache_read: 100, cache_creation: 50 },
                estimated_cost: { amount: 150, currency: 'USD' }
              }
            ]
          }
        ],
        has_more: false
      };

      const metrics = parseClaudeResponse(response);

      expect(metrics.users['dev@test.com']).toBeDefined();
      expect(metrics.totals.sessions).toBe(5);
      expect(metrics.totals.linesAdded).toBe(100);
      expect(metrics.totals.costCents).toBe(150);
    });

    it('aggregates multiple users', () => {
      const response = {
        data: [
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev1@test.com' },
            core_metrics: { num_sessions: 3, lines_of_code: { added: 50, removed: 10 } },
            tool_actions: { edit_tool: { accepted: 5, rejected: 1 } },
            model_breakdown: [{ model: 'claude-sonnet-4', estimated_cost: { amount: 100 } }]
          },
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev2@test.com' },
            core_metrics: { num_sessions: 2, lines_of_code: { added: 30, removed: 5 } },
            tool_actions: { edit_tool: { accepted: 3, rejected: 0 } },
            model_breakdown: [{ model: 'claude-sonnet-4', estimated_cost: { amount: 50 } }]
          }
        ],
        has_more: false
      };

      const metrics = parseClaudeResponse(response);

      expect(metrics.totals.sessions).toBe(5);
      expect(metrics.totals.linesAdded).toBe(80);
      expect(metrics.totals.costCents).toBe(150);
      expect(Object.keys(metrics.users).length).toBe(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/claude.test.js
```
Expected: FAIL - module not found

**Step 3: Implement lib/claude.js**

Create `lib/claude.js`:
```javascript
const https = require('https');

function parseClaudeResponse(response) {
  const totals = {
    sessions: 0,
    linesAdded: 0,
    linesRemoved: 0,
    commits: 0,
    prs: 0,
    costCents: 0,
    tokensInput: 0,
    tokensOutput: 0,
    editAccepted: 0,
    editRejected: 0,
    writeAccepted: 0,
    writeRejected: 0
  };

  const users = {};
  const byDate = {};

  for (const record of response.data) {
    const email = record.actor?.email_address || record.actor?.api_key_name || 'unknown';
    const date = record.date?.split('T')[0];

    const core = record.core_metrics || {};
    const tools = record.tool_actions || {};
    const models = record.model_breakdown || [];

    // Aggregate totals
    totals.sessions += core.num_sessions || 0;
    totals.linesAdded += core.lines_of_code?.added || 0;
    totals.linesRemoved += core.lines_of_code?.removed || 0;
    totals.commits += core.commits_by_claude_code || 0;
    totals.prs += core.pull_requests_by_claude_code || 0;
    totals.editAccepted += tools.edit_tool?.accepted || 0;
    totals.editRejected += tools.edit_tool?.rejected || 0;
    totals.writeAccepted += tools.write_tool?.accepted || 0;
    totals.writeRejected += tools.write_tool?.rejected || 0;

    for (const model of models) {
      totals.costCents += model.estimated_cost?.amount || 0;
      totals.tokensInput += model.tokens?.input || 0;
      totals.tokensOutput += model.tokens?.output || 0;
    }

    // Aggregate by user
    if (!users[email]) {
      users[email] = { sessions: 0, linesAdded: 0, linesRemoved: 0, costCents: 0 };
    }
    users[email].sessions += core.num_sessions || 0;
    users[email].linesAdded += core.lines_of_code?.added || 0;
    users[email].linesRemoved += core.lines_of_code?.removed || 0;
    for (const model of models) {
      users[email].costCents += model.estimated_cost?.amount || 0;
    }

    // Aggregate by date
    if (date) {
      if (!byDate[date]) {
        byDate[date] = { sessions: 0, linesAdded: 0, costCents: 0 };
      }
      byDate[date].sessions += core.num_sessions || 0;
      byDate[date].linesAdded += core.lines_of_code?.added || 0;
      for (const model of models) {
        byDate[date].costCents += model.estimated_cost?.amount || 0;
      }
    }
  }

  return { totals, users, byDate };
}

async function fetchClaudeMetrics(apiKey, date) {
  return new Promise((resolve, reject) => {
    const url = `https://api.anthropic.com/v1/organizations/usage_report/claude_code?starting_at=${date}&limit=1000`;

    const req = https.request(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'CodeAnalytics/1.0.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Claude API error: ${res.statusCode} ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchClaudeDateRange(apiKey, startDate, endDate) {
  const results = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    try {
      const response = await fetchClaudeMetrics(apiKey, dateStr);
      results.push({ date: dateStr, data: response });
    } catch (err) {
      console.error(`Failed to fetch Claude metrics for ${dateStr}:`, err.message);
    }
  }

  return results;
}

module.exports = { fetchClaudeMetrics, fetchClaudeDateRange, parseClaudeResponse };
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/claude.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add lib/claude.js tests/claude.test.js
git commit -m "feat: add Claude Code API client"
```

---

## Task 4: Cursor API Client

**Files:**
- Create: `lib/cursor.js`
- Create: `tests/cursor.test.js`

**Step 1: Write failing test**

Create `tests/cursor.test.js`:
```javascript
const { parseCursorCommits, parseCursorDau } = require('../lib/cursor');

describe('cursor', () => {
  describe('parseCursorCommits', () => {
    it('calculates AI attribution from commits', () => {
      const response = {
        data: [
          {
            commitHash: 'abc123',
            userEmail: 'dev@test.com',
            totalLinesAdded: 100,
            tabLinesAdded: 40,
            composerLinesAdded: 30,
            nonAiLinesAdded: 30
          },
          {
            commitHash: 'def456',
            userEmail: 'dev@test.com',
            totalLinesAdded: 50,
            tabLinesAdded: 25,
            composerLinesAdded: 15,
            nonAiLinesAdded: 10
          }
        ]
      };

      const metrics = parseCursorCommits(response);

      expect(metrics.totals.totalLines).toBe(150);
      expect(metrics.totals.tabLines).toBe(65);
      expect(metrics.totals.composerLines).toBe(45);
      expect(metrics.totals.aiPercent).toBeCloseTo(73.3, 1);
    });
  });

  describe('parseCursorDau', () => {
    it('parses DAU response', () => {
      const response = {
        data: [
          { date: '2025-01-01', dau: 10 },
          { date: '2025-01-02', dau: 12 }
        ]
      };

      const metrics = parseCursorDau(response);

      expect(metrics.byDate['2025-01-01']).toBe(10);
      expect(metrics.byDate['2025-01-02']).toBe(12);
      expect(metrics.avgDau).toBe(11);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/cursor.test.js
```
Expected: FAIL - module not found

**Step 3: Implement lib/cursor.js**

Create `lib/cursor.js`:
```javascript
const https = require('https');

function parseCursorCommits(response) {
  const totals = {
    totalLines: 0,
    tabLines: 0,
    composerLines: 0,
    nonAiLines: 0,
    aiPercent: 0
  };

  const byUser = {};

  for (const commit of response.data || []) {
    totals.totalLines += commit.totalLinesAdded || 0;
    totals.tabLines += commit.tabLinesAdded || 0;
    totals.composerLines += commit.composerLinesAdded || 0;
    totals.nonAiLines += commit.nonAiLinesAdded || 0;

    const email = commit.userEmail || 'unknown';
    if (!byUser[email]) {
      byUser[email] = { totalLines: 0, aiLines: 0 };
    }
    byUser[email].totalLines += commit.totalLinesAdded || 0;
    byUser[email].aiLines += (commit.tabLinesAdded || 0) + (commit.composerLinesAdded || 0);
  }

  if (totals.totalLines > 0) {
    totals.aiPercent = ((totals.tabLines + totals.composerLines) / totals.totalLines) * 100;
  }

  return { totals, byUser };
}

function parseCursorDau(response) {
  const byDate = {};
  let totalDau = 0;
  let days = 0;

  for (const record of response.data || []) {
    byDate[record.date] = record.dau;
    totalDau += record.dau;
    days++;
  }

  return {
    byDate,
    avgDau: days > 0 ? totalDau / days : 0
  };
}

async function cursorRequest(apiKey, endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `https://api.cursor.com${endpoint}${queryString ? '?' + queryString : ''}`;

    const auth = Buffer.from(`${apiKey}:`).toString('base64');

    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'CodeAnalytics/1.0.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Cursor API error: ${res.statusCode} ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchCursorCommits(apiKey, startDate, endDate) {
  return cursorRequest(apiKey, '/analytics/ai-code/commits', { startDate, endDate });
}

async function fetchCursorDau(apiKey, startDate, endDate) {
  return cursorRequest(apiKey, '/analytics/team/dau', { startDate, endDate });
}

async function fetchCursorAgentEdits(apiKey, startDate, endDate) {
  return cursorRequest(apiKey, '/analytics/team/agent-edits', { startDate, endDate });
}

module.exports = {
  parseCursorCommits,
  parseCursorDau,
  fetchCursorCommits,
  fetchCursorDau,
  fetchCursorAgentEdits,
  cursorRequest
};
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/cursor.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add lib/cursor.js tests/cursor.test.js
git commit -m "feat: add Cursor API client"
```

---

## Task 5: GitHub API Client

**Files:**
- Create: `lib/github.js`
- Create: `tests/github.test.js`

**Step 1: Write failing test**

Create `tests/github.test.js`:
```javascript
const { parsePRs, calculateCycleTime } = require('../lib/github');

describe('github', () => {
  describe('calculateCycleTime', () => {
    it('calculates hours between created and merged', () => {
      const pr = {
        created_at: '2025-01-01T10:00:00Z',
        merged_at: '2025-01-01T14:00:00Z'
      };
      expect(calculateCycleTime(pr)).toBe(4);
    });

    it('returns null for unmerged PRs', () => {
      const pr = { created_at: '2025-01-01T10:00:00Z', merged_at: null };
      expect(calculateCycleTime(pr)).toBeNull();
    });
  });

  describe('parsePRs', () => {
    it('aggregates PR metrics', () => {
      const prs = [
        {
          number: 1,
          user: { login: 'dev1' },
          created_at: '2025-01-01T10:00:00Z',
          merged_at: '2025-01-01T14:00:00Z',
          comments: 3
        },
        {
          number: 2,
          user: { login: 'dev2' },
          created_at: '2025-01-01T08:00:00Z',
          merged_at: '2025-01-01T20:00:00Z',
          comments: 5
        },
        {
          number: 3,
          user: { login: 'dev1' },
          created_at: '2025-01-01T10:00:00Z',
          merged_at: null,
          comments: 0
        }
      ];

      const metrics = parsePRs(prs);

      expect(metrics.totals.prCount).toBe(3);
      expect(metrics.totals.mergedCount).toBe(2);
      expect(metrics.totals.avgCycleTimeHours).toBe(8); // (4 + 12) / 2
      expect(metrics.byAuthor['dev1'].prCount).toBe(2);
      expect(metrics.byAuthor['dev2'].prCount).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/github.test.js
```
Expected: FAIL - module not found

**Step 3: Implement lib/github.js**

Create `lib/github.js`:
```javascript
const https = require('https');

function calculateCycleTime(pr) {
  if (!pr.merged_at) return null;
  const created = new Date(pr.created_at);
  const merged = new Date(pr.merged_at);
  return (merged - created) / (1000 * 60 * 60); // hours
}

function parsePRs(prs) {
  const totals = {
    prCount: 0,
    mergedCount: 0,
    avgCycleTimeHours: 0,
    totalComments: 0
  };

  const byAuthor = {};
  const cycleTimes = [];

  for (const pr of prs) {
    totals.prCount++;
    totals.totalComments += pr.comments || 0;

    const author = pr.user?.login || 'unknown';
    if (!byAuthor[author]) {
      byAuthor[author] = { prCount: 0, mergedCount: 0, totalCycleTime: 0 };
    }
    byAuthor[author].prCount++;

    const cycleTime = calculateCycleTime(pr);
    if (cycleTime !== null) {
      totals.mergedCount++;
      byAuthor[author].mergedCount++;
      byAuthor[author].totalCycleTime += cycleTime;
      cycleTimes.push(cycleTime);
    }
  }

  if (cycleTimes.length > 0) {
    totals.avgCycleTimeHours = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
  }

  return { totals, byAuthor };
}

async function githubRequest(token, endpoint) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com${endpoint}`;

    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeAnalytics/1.0.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchPRs(token, owner, repo, state = 'all', perPage = 100) {
  const prs = [];
  let page = 1;

  while (true) {
    const endpoint = `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}&page=${page}`;
    const batch = await githubRequest(token, endpoint);

    if (batch.length === 0) break;
    prs.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return prs;
}

async function fetchPRsDateRange(token, owner, repo, startDate, endDate) {
  const allPRs = await fetchPRs(token, owner, repo, 'all');

  const start = new Date(startDate);
  const end = new Date(endDate);

  return allPRs.filter(pr => {
    const created = new Date(pr.created_at);
    return created >= start && created <= end;
  });
}

module.exports = {
  calculateCycleTime,
  parsePRs,
  fetchPRs,
  fetchPRsDateRange,
  githubRequest
};
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/github.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add lib/github.js tests/github.test.js
git commit -m "feat: add GitHub API client"
```

---

## Task 6: Express Server & Routes

**Files:**
- Create: `server.js`
- Create: `tests/server.test.js`

**Step 1: Write failing test**

Create `tests/server.test.js`:
```javascript
const http = require('http');

const BASE_URL = 'http://localhost:3001';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('server', () => {
  let server;

  beforeAll((done) => {
    process.env.PORT = '3001';
    server = require('../server');
    setTimeout(done, 500); // wait for server to start
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/health', () => {
    it('returns ok', async () => {
      const res = await request('GET', '/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/metrics', () => {
    it('returns metrics from database', async () => {
      const res = await request('GET', '/api/metrics?startDate=2025-01-01&endDate=2025-01-31');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/server.test.js
```
Expected: FAIL - module not found

**Step 3: Implement server.js**

Create `server.js`:
```javascript
require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./lib/db');
const github = require('./lib/github');
const cursor = require('./lib/cursor');
const claude = require('./lib/claude');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get metrics from database
app.get('/api/metrics', async (req, res) => {
  try {
    const { source, startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    let metrics;
    if (source) {
      metrics = await db.getMetrics(source, 'daily', start, end);
    } else {
      metrics = await db.getAllMetrics(start, end);
    }
    res.json(metrics);
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// Backfill data from external APIs
app.post('/api/backfill', async (req, res) => {
  try {
    const { source, startDate, endDate } = req.body;

    if (!source || !startDate || !endDate) {
      return res.status(400).json({ error: 'source, startDate, and endDate are required' });
    }

    let count = 0;

    if (source === 'claude') {
      const apiKey = process.env.CLAUDE_ADMIN_KEY;
      if (!apiKey) return res.status(400).json({ error: 'CLAUDE_ADMIN_KEY not configured' });

      const results = await claude.fetchClaudeDateRange(apiKey, startDate, endDate);
      for (const { date, data } of results) {
        const parsed = claude.parseClaudeResponse(data);
        await db.saveMetric('claude', 'daily', date, parsed);
        count++;
      }
    }

    if (source === 'cursor') {
      const apiKey = process.env.CURSOR_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'CURSOR_API_KEY not configured' });

      // Fetch commits for AI attribution
      const commits = await cursor.fetchCursorCommits(apiKey, startDate, endDate);
      const commitMetrics = cursor.parseCursorCommits(commits);

      // Fetch DAU
      const dau = await cursor.fetchCursorDau(apiKey, startDate, endDate);
      const dauMetrics = cursor.parseCursorDau(dau);

      // Save daily metrics
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        await db.saveMetric('cursor', 'daily', dateStr, {
          aiAttribution: commitMetrics.totals,
          dau: dauMetrics.byDate[dateStr] || 0
        });
        count++;
      }
    }

    if (source === 'github') {
      const token = process.env.GITHUB_TOKEN;
      const repos = process.env.GITHUB_REPOS; // comma-separated owner/repo
      if (!token) return res.status(400).json({ error: 'GITHUB_TOKEN not configured' });
      if (!repos) return res.status(400).json({ error: 'GITHUB_REPOS not configured' });

      for (const repo of repos.split(',')) {
        const [owner, repoName] = repo.trim().split('/');
        const prs = await github.fetchPRsDateRange(token, owner, repoName, startDate, endDate);
        const metrics = github.parsePRs(prs);

        // Group PRs by date
        const byDate = {};
        for (const pr of prs) {
          const date = pr.created_at.split('T')[0];
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(pr);
        }

        for (const [date, datePRs] of Object.entries(byDate)) {
          const dayMetrics = github.parsePRs(datePRs);
          await db.saveMetric('github', 'daily', date, {
            repo: `${owner}/${repoName}`,
            ...dayMetrics.totals,
            byAuthor: dayMetrics.byAuthor
          });
          count++;
        }
      }
    }

    res.json({ success: true, count, message: `Backfilled ${count} records for ${source}` });
  } catch (err) {
    console.error('Error backfilling:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard summary endpoint
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const allMetrics = await db.getAllMetrics(start, end);

    const summary = {
      github: { avgCycleTimeHours: 0, prCount: 0 },
      cursor: { aiPercent: 0, avgDau: 0 },
      claude: { sessions: 0, costDollars: 0 }
    };

    const githubMetrics = allMetrics.filter(m => m.source === 'github');
    const cursorMetrics = allMetrics.filter(m => m.source === 'cursor');
    const claudeMetrics = allMetrics.filter(m => m.source === 'claude');

    // Aggregate GitHub
    let totalCycleTime = 0, cycleTimeCount = 0;
    for (const m of githubMetrics) {
      summary.github.prCount += m.data.prCount || 0;
      if (m.data.avgCycleTimeHours) {
        totalCycleTime += m.data.avgCycleTimeHours;
        cycleTimeCount++;
      }
    }
    if (cycleTimeCount > 0) summary.github.avgCycleTimeHours = totalCycleTime / cycleTimeCount;

    // Aggregate Cursor
    let totalAiPercent = 0, dauSum = 0, dauCount = 0;
    for (const m of cursorMetrics) {
      if (m.data.aiAttribution?.aiPercent) totalAiPercent = m.data.aiAttribution.aiPercent; // use latest
      if (m.data.dau) { dauSum += m.data.dau; dauCount++; }
    }
    summary.cursor.aiPercent = totalAiPercent;
    if (dauCount > 0) summary.cursor.avgDau = dauSum / dauCount;

    // Aggregate Claude
    for (const m of claudeMetrics) {
      summary.claude.sessions += m.data.totals?.sessions || 0;
      summary.claude.costDollars += (m.data.totals?.costCents || 0) / 100;
    }

    res.json(summary);
  } catch (err) {
    console.error('Error generating summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// Config endpoints
app.get('/api/config', async (req, res) => {
  try {
    const keys = ['github_repos'];
    const config = {};
    for (const key of keys) {
      config[key] = await db.getConfig(key);
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const { key, value } = req.body;
    await db.saveConfig(key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = server;
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/server.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: add Express server with API routes"
```

---

## Task 7: Frontend Dashboard

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/style.css`

**Step 1: Create public/style.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  padding: 20px;
  color: #333;
}

.container { max-width: 1200px; margin: 0 auto; }

h1 { color: #2c3e50; margin-bottom: 20px; }

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  flex-wrap: wrap;
  align-items: center;
}

.controls input, .controls select, .controls button {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.controls button {
  background: #3498db;
  color: white;
  border: none;
  cursor: pointer;
}

.controls button:hover { background: #2980b9; }
.controls button.secondary { background: #95a5a6; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.metric-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.metric-card h3 {
  font-size: 12px;
  color: #7f8c8d;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.metric-card .value {
  font-size: 32px;
  font-weight: 600;
  color: #2c3e50;
}

.metric-card .label {
  font-size: 14px;
  color: #95a5a6;
  margin-top: 5px;
}

.metric-card.github { border-left: 4px solid #24292e; }
.metric-card.cursor { border-left: 4px solid #00d1b2; }
.metric-card.claude { border-left: 4px solid #c96442; }

.section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

.section h2 {
  font-size: 16px;
  color: #2c3e50;
  margin-bottom: 15px;
}

.backfill-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.status { padding: 10px; border-radius: 4px; margin-top: 10px; }
.status.success { background: #d4edda; color: #155724; }
.status.error { background: #f8d7da; color: #721c24; }
.status.loading { background: #fff3cd; color: #856404; }
```

**Step 2: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Analytics Dashboard</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Code Analytics Dashboard</h1>

    <div class="controls">
      <label>From: <input type="date" id="startDate"></label>
      <label>To: <input type="date" id="endDate"></label>
      <button onclick="loadDashboard()">Refresh</button>
    </div>

    <div class="metrics-grid" id="metrics">
      <div class="metric-card github">
        <h3>GitHub - Cycle Time</h3>
        <div class="value" id="cycleTime">--</div>
        <div class="label">avg hours to merge</div>
      </div>
      <div class="metric-card github">
        <h3>GitHub - PRs</h3>
        <div class="value" id="prCount">--</div>
        <div class="label">pull requests</div>
      </div>
      <div class="metric-card cursor">
        <h3>Cursor - AI Code</h3>
        <div class="value" id="aiPercent">--</div>
        <div class="label">% from AI</div>
      </div>
      <div class="metric-card cursor">
        <h3>Cursor - DAU</h3>
        <div class="value" id="cursorDau">--</div>
        <div class="label">avg daily users</div>
      </div>
      <div class="metric-card claude">
        <h3>Claude Code - Sessions</h3>
        <div class="value" id="claudeSessions">--</div>
        <div class="label">total sessions</div>
      </div>
      <div class="metric-card claude">
        <h3>Claude Code - Cost</h3>
        <div class="value" id="claudeCost">--</div>
        <div class="label">estimated spend</div>
      </div>
    </div>

    <div class="section">
      <h2>Backfill Data</h2>
      <div class="backfill-form">
        <select id="backfillSource">
          <option value="github">GitHub</option>
          <option value="cursor">Cursor</option>
          <option value="claude">Claude Code</option>
        </select>
        <label>From: <input type="date" id="backfillStart"></label>
        <label>To: <input type="date" id="backfillEnd"></label>
        <button onclick="runBackfill()">Fetch Data</button>
      </div>
      <div id="backfillStatus"></div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

**Step 3: Create public/app.js**

```javascript
// Initialize dates
const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

document.getElementById('startDate').value = thirtyDaysAgo;
document.getElementById('endDate').value = today;
document.getElementById('backfillStart').value = thirtyDaysAgo;
document.getElementById('backfillEnd').value = today;

async function loadDashboard() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  try {
    const res = await fetch(`/api/dashboard/summary?startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();

    document.getElementById('cycleTime').textContent =
      data.github.avgCycleTimeHours ? data.github.avgCycleTimeHours.toFixed(1) : '--';
    document.getElementById('prCount').textContent =
      data.github.prCount || '--';
    document.getElementById('aiPercent').textContent =
      data.cursor.aiPercent ? data.cursor.aiPercent.toFixed(1) + '%' : '--';
    document.getElementById('cursorDau').textContent =
      data.cursor.avgDau ? data.cursor.avgDau.toFixed(1) : '--';
    document.getElementById('claudeSessions').textContent =
      data.claude.sessions || '--';
    document.getElementById('claudeCost').textContent =
      data.claude.costDollars ? '$' + data.claude.costDollars.toFixed(2) : '--';
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function runBackfill() {
  const source = document.getElementById('backfillSource').value;
  const startDate = document.getElementById('backfillStart').value;
  const endDate = document.getElementById('backfillEnd').value;
  const statusEl = document.getElementById('backfillStatus');

  statusEl.className = 'status loading';
  statusEl.textContent = `Fetching ${source} data...`;

  try {
    const res = await fetch('/api/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, startDate, endDate })
    });

    const data = await res.json();

    if (res.ok) {
      statusEl.className = 'status success';
      statusEl.textContent = data.message;
      loadDashboard();
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + data.error;
    }
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Error: ' + err.message;
  }
}

// Load dashboard on page load
loadDashboard();
```

**Step 4: Commit**

```bash
git add public/
git commit -m "feat: add frontend dashboard"
```

---

## Task 8: Final Setup Files

**Files:**
- Create: `.env.example` (update)
- Create: `README.md`

**Step 1: Update .env.example**

```env
# Database
DATABASE_URL=postgresql://localhost:5432/code_analytics

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_REPOS=owner/repo1,owner/repo2

# Cursor (Enterprise only)
CURSOR_API_KEY=xxxxxxxxxxxxxxxxxxxx

# Claude Code Admin
CLAUDE_ADMIN_KEY=sk-ant-admin-xxxxxxxxxxxxxxxxxxxx

# Server
PORT=3000
```

**Step 2: Create README.md**

```markdown
# Code Analytics Dashboard

Unified dashboard for developer productivity metrics across GitHub, Cursor, and Claude Code.

## Setup

1. Create database:
   ```bash
   createdb code_analytics
   psql -d code_analytics -f schema.sql
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Install and run:
   ```bash
   npm install
   npm start
   ```

4. Open http://localhost:3000

## Usage

1. Use the Backfill section to fetch data from each source
2. Dashboard auto-refreshes after backfill
3. Change date range and click Refresh to update view

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/metrics` - Get stored metrics
- `POST /api/backfill` - Fetch and store data from external APIs
- `GET /api/dashboard/summary` - Combined metrics summary

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `GITHUB_TOKEN` - GitHub personal access token
- `GITHUB_REPOS` - Comma-separated list of owner/repo
- `CURSOR_API_KEY` - Cursor team API key (enterprise)
- `CLAUDE_ADMIN_KEY` - Anthropic Admin API key

## Tests

```bash
npm test
```
```

**Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add README and update env example"
```

---

## Summary

**Total tasks:** 8
**Estimated commits:** 8

**Order of implementation:**
1. Project setup (dependencies)
2. Database schema + db.js
3. Claude API client
4. Cursor API client
5. GitHub API client
6. Express server + routes
7. Frontend dashboard
8. Documentation

Each task follows TDD: write failing test → implement → verify pass → commit.
