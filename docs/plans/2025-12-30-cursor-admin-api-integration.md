# Cursor Admin API Integration Plan

> **For Claude:** Follow TDD discipline. Write failing test first, verify it fails, implement, verify it passes.

**Goal:** Replace Enterprise Analytics API with Admin API (available on Teams plan) to get Cursor usage metrics.

**API Documentation:** https://cursor.com/docs/account/teams/admin-api

---

## TDD Discipline (MANDATORY)

```
1. RED: Write failing test
2. VERIFY RED: Run test, confirm FAIL
3. GREEN: Write minimal code
4. VERIFY GREEN: Run test, confirm PASS
5. COMMIT
```

---

## Task 1: Update Cursor Client - Core Request Function

**Files:**
- Modify: `lib/cursor.js`
- Modify: `tests/cursor.test.js`

### Step 1: Write failing test for cursorAdminRequest

```javascript
describe('cursorAdminRequest', () => {
  it('sends POST request with JSON body and Basic auth', async () => {
    // This is an integration test - will hit real API
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return; // skip if no key

    const startDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const endDate = Date.now();

    const result = await cursorAdminRequest(apiKey, '/teams/daily-usage-data', {
      startDate,
      endDate
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('period');
  });
});
```

### Step 2: Run test to verify it fails
```bash
npm test -- tests/cursor.test.js
```
Expected: FAIL - cursorAdminRequest is not defined

### Step 3: Implement cursorAdminRequest

```javascript
async function cursorAdminRequest(apiKey, endpoint, body = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.cursor.com${endpoint}`);
    const auth = Buffer.from(`${apiKey}:`).toString('base64');
    const bodyStr = JSON.stringify(body);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
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
    req.write(bodyStr);
    req.end();
  });
}
```

### Step 4: Run test to verify it passes
```bash
npm test -- tests/cursor.test.js
```

### Step 5: Commit
```bash
git add lib/cursor.js tests/cursor.test.js
git commit -m "feat(cursor): add cursorAdminRequest for Admin API"
```

---

## Task 2: Fetch Daily Usage Data

**Files:**
- Modify: `lib/cursor.js`
- Modify: `tests/cursor.test.js`

### Step 1: Write failing integration test

```javascript
describe('fetchDailyUsage', () => {
  it('fetches daily usage for date range', async () => {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return;

    const startDate = '2025-12-01';
    const endDate = '2025-12-07';

    const result = await fetchDailyUsage(apiKey, startDate, endDate);

    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
    expect(result).toHaveProperty('period');
  });

  it('converts ISO dates to epoch milliseconds', async () => {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return;

    const result = await fetchDailyUsage(apiKey, '2025-12-01', '2025-12-02');

    // Should not throw - dates converted correctly
    expect(result).toBeDefined();
  });
});
```

### Step 2: Run test to verify it fails
```bash
npm test -- tests/cursor.test.js
```

### Step 3: Implement fetchDailyUsage

```javascript
async function fetchDailyUsage(apiKey, startDate, endDate) {
  // Convert ISO date strings to epoch milliseconds
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // API limit: 30 days max per request
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (endMs - startMs > thirtyDays) {
    throw new Error('Date range cannot exceed 30 days');
  }

  return cursorAdminRequest(apiKey, '/teams/daily-usage-data', {
    startDate: startMs,
    endDate: endMs
  });
}
```

### Step 4: Run test to verify it passes
### Step 5: Commit

---

## Task 3: Parse Daily Usage Response

**Files:**
- Modify: `lib/cursor.js`
- Modify: `tests/cursor.test.js`

### Step 1: Write failing unit test

```javascript
describe('parseDailyUsage', () => {
  it('calculates AI code percentage', () => {
    const response = {
      data: [
        {
          email: 'dev@test.com',
          date: 1735689600000,
          isActive: true,
          totalLinesAdded: 1000,
          acceptedLinesAdded: 700,
          totalTabsShown: 100,
          totalTabsAccepted: 85,
          composerRequests: 10,
          chatRequests: 20,
          agentRequests: 5
        }
      ]
    };

    const result = parseDailyUsage(response);

    expect(result.totals.aiCodePercent).toBe(70); // 700/1000 * 100
    expect(result.totals.tabAcceptRate).toBe(85); // 85/100 * 100
    expect(result.totals.totalRequests).toBe(35); // 10+20+5
    expect(result.totals.activeUsers).toBe(1);
  });

  it('aggregates multiple users', () => {
    const response = {
      data: [
        {
          email: 'dev1@test.com',
          isActive: true,
          totalLinesAdded: 500,
          acceptedLinesAdded: 300,
          totalTabsShown: 50,
          totalTabsAccepted: 40
        },
        {
          email: 'dev2@test.com',
          isActive: true,
          totalLinesAdded: 500,
          acceptedLinesAdded: 400,
          totalTabsShown: 50,
          totalTabsAccepted: 45
        }
      ]
    };

    const result = parseDailyUsage(response);

    expect(result.totals.aiCodePercent).toBe(70); // 700/1000 * 100
    expect(result.totals.activeUsers).toBe(2);
    expect(Object.keys(result.byUser).length).toBe(2);
  });

  it('handles zero lines gracefully', () => {
    const response = {
      data: [{ email: 'dev@test.com', totalLinesAdded: 0, acceptedLinesAdded: 0 }]
    };

    const result = parseDailyUsage(response);

    expect(result.totals.aiCodePercent).toBe(0);
  });
});
```

### Step 2: Run test to verify it fails
### Step 3: Implement parseDailyUsage

```javascript
function parseDailyUsage(response) {
  const totals = {
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    acceptedLinesAdded: 0,
    totalTabsShown: 0,
    totalTabsAccepted: 0,
    composerRequests: 0,
    chatRequests: 0,
    agentRequests: 0,
    totalRequests: 0,
    activeUsers: 0,
    aiCodePercent: 0,
    tabAcceptRate: 0
  };

  const byUser = {};
  const byDate = {};

  for (const record of response.data || []) {
    const email = record.email || 'unknown';
    const dateKey = new Date(record.date).toISOString().split('T')[0];

    // Aggregate totals
    totals.totalLinesAdded += record.totalLinesAdded || 0;
    totals.totalLinesDeleted += record.totalLinesDeleted || 0;
    totals.acceptedLinesAdded += record.acceptedLinesAdded || 0;
    totals.totalTabsShown += record.totalTabsShown || 0;
    totals.totalTabsAccepted += record.totalTabsAccepted || 0;
    totals.composerRequests += record.composerRequests || 0;
    totals.chatRequests += record.chatRequests || 0;
    totals.agentRequests += record.agentRequests || 0;

    if (record.isActive) totals.activeUsers++;

    // By user
    if (!byUser[email]) {
      byUser[email] = {
        totalLinesAdded: 0,
        acceptedLinesAdded: 0,
        totalTabsShown: 0,
        totalTabsAccepted: 0,
        requests: 0
      };
    }
    byUser[email].totalLinesAdded += record.totalLinesAdded || 0;
    byUser[email].acceptedLinesAdded += record.acceptedLinesAdded || 0;
    byUser[email].totalTabsShown += record.totalTabsShown || 0;
    byUser[email].totalTabsAccepted += record.totalTabsAccepted || 0;
    byUser[email].requests += (record.composerRequests || 0) +
                              (record.chatRequests || 0) +
                              (record.agentRequests || 0);

    // By date
    if (!byDate[dateKey]) {
      byDate[dateKey] = { linesAdded: 0, acceptedLines: 0, activeUsers: 0 };
    }
    byDate[dateKey].linesAdded += record.totalLinesAdded || 0;
    byDate[dateKey].acceptedLines += record.acceptedLinesAdded || 0;
    if (record.isActive) byDate[dateKey].activeUsers++;
  }

  // Calculate percentages
  totals.totalRequests = totals.composerRequests + totals.chatRequests + totals.agentRequests;
  totals.aiCodePercent = totals.totalLinesAdded > 0
    ? (totals.acceptedLinesAdded / totals.totalLinesAdded) * 100
    : 0;
  totals.tabAcceptRate = totals.totalTabsShown > 0
    ? (totals.totalTabsAccepted / totals.totalTabsShown) * 100
    : 0;

  return { totals, byUser, byDate };
}
```

### Step 4: Run test to verify it passes
### Step 5: Commit

---

## Task 4: Fetch Spend Data

**Files:**
- Modify: `lib/cursor.js`
- Modify: `tests/cursor.test.js`

### Step 1: Write failing integration test

```javascript
describe('fetchSpend', () => {
  it('fetches current month spend data', async () => {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return;

    const result = await fetchSpend(apiKey);

    expect(result).toHaveProperty('teamMemberSpend');
    expect(Array.isArray(result.teamMemberSpend)).toBe(true);
  });
});

describe('parseSpend', () => {
  it('aggregates spend across users', () => {
    const response = {
      teamMemberSpend: [
        { email: 'dev1@test.com', spendCents: 1000 },
        { email: 'dev2@test.com', spendCents: 2000 }
      ]
    };

    const result = parseSpend(response);

    expect(result.totalSpendCents).toBe(3000);
    expect(result.totalSpendDollars).toBe(30);
    expect(result.byUser['dev1@test.com'].spendCents).toBe(1000);
  });
});
```

### Step 2: Run test to verify it fails
### Step 3: Implement fetchSpend and parseSpend

```javascript
async function fetchSpend(apiKey) {
  return cursorAdminRequest(apiKey, '/teams/spend', {});
}

function parseSpend(response) {
  const byUser = {};
  let totalSpendCents = 0;

  for (const member of response.teamMemberSpend || []) {
    const email = member.email || 'unknown';
    totalSpendCents += member.spendCents || 0;

    byUser[email] = {
      spendCents: member.spendCents || 0,
      spendDollars: (member.spendCents || 0) / 100,
      fastPremiumRequests: member.fastPremiumRequests || 0
    };
  }

  return {
    totalSpendCents,
    totalSpendDollars: totalSpendCents / 100,
    byUser
  };
}
```

### Step 4: Run test to verify it passes
### Step 5: Commit

---

## Task 5: Update Server Backfill Endpoint

**Files:**
- Modify: `server.js`
- Modify: `tests/server.test.js`

### Step 1: Write failing integration test

```javascript
describe('POST /api/backfill cursor', () => {
  it('backfills Cursor data using Admin API', async () => {
    const res = await request('POST', '/api/backfill', {
      source: 'cursor',
      startDate: '2025-12-01',
      endDate: '2025-12-07'
    });

    // Should not return Enterprise error anymore
    expect(res.status).not.toBe(400);
    expect(res.body.error).not.toContain('Enterprise');
  });
});
```

### Step 2: Run test to verify it fails
### Step 3: Update server.js backfill handler

```javascript
if (source === 'cursor') {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'CURSOR_API_KEY not configured' });

  // Fetch daily usage
  const usage = await cursor.fetchDailyUsage(apiKey, startDate, endDate);
  const usageMetrics = cursor.parseDailyUsage(usage);

  // Save by date
  for (const [date, dayData] of Object.entries(usageMetrics.byDate)) {
    await db.saveMetric('cursor', 'daily', date, {
      ...dayData,
      totals: usageMetrics.totals,
      byUser: usageMetrics.byUser
    });
    count++;
  }

  // Fetch and save spend (monthly)
  try {
    const spend = await cursor.fetchSpend(apiKey);
    const spendMetrics = cursor.parseSpend(spend);
    await db.saveMetric('cursor', 'spend', new Date().toISOString().split('T')[0], spendMetrics);
  } catch (err) {
    console.warn('Failed to fetch spend data:', err.message);
  }
}
```

### Step 4: Run test to verify it passes
### Step 5: Commit

---

## Task 6: Update Dashboard Summary

**Files:**
- Modify: `server.js`
- Modify: `public/index.html`
- Modify: `public/app.js`

### Step 1: Update summary aggregation in server.js

```javascript
// Aggregate Cursor (updated)
for (const m of cursorMetrics) {
  if (m.data.totals) {
    summary.cursor.aiCodePercent = m.data.totals.aiCodePercent || 0;
    summary.cursor.tabAcceptRate = m.data.totals.tabAcceptRate || 0;
    summary.cursor.activeUsers = m.data.totals.activeUsers || 0;
    summary.cursor.totalRequests = m.data.totals.totalRequests || 0;
  }
  if (m.metric_type === 'spend' && m.data.totalSpendDollars) {
    summary.cursor.spendDollars = m.data.totalSpendDollars;
  }
}
```

### Step 2: Update frontend to display new metrics
### Step 3: Commit

---

## Task 7: End-to-End Integration Test

**Files:**
- Create: `tests/integration/cursor.integration.test.js`

```javascript
describe('Cursor Integration E2E', () => {
  it('backfills data and shows in dashboard summary', async () => {
    // 1. Backfill
    const backfillRes = await request('POST', '/api/backfill', {
      source: 'cursor',
      startDate: '2025-12-20',
      endDate: '2025-12-27'
    });
    expect(backfillRes.status).toBe(200);

    // 2. Check summary
    const summaryRes = await request('GET', '/api/dashboard/summary?startDate=2025-12-20&endDate=2025-12-27');
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.cursor).toBeDefined();
    expect(typeof summaryRes.body.cursor.aiCodePercent).toBe('number');
  });
});
```

---

## Summary

| Task | Description | Test Type |
|------|-------------|-----------|
| 1 | cursorAdminRequest | Integration |
| 2 | fetchDailyUsage | Integration |
| 3 | parseDailyUsage | Unit |
| 4 | fetchSpend + parseSpend | Unit + Integration |
| 5 | Server backfill endpoint | Integration |
| 6 | Dashboard summary | Manual |
| 7 | E2E test | Integration |

**Run all tests:** `npm test`
**Run integration tests only:** `npm test -- --testPathPattern=integration`
