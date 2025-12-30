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

      // Fetch daily usage data
      const usage = await cursor.fetchDailyUsage(apiKey, startDate, endDate);
      const usageMetrics = cursor.parseDailyUsage(usage);

      // Save aggregated metrics by date
      for (const [date, dayData] of Object.entries(usageMetrics.byDate)) {
        await db.saveMetric('cursor', 'daily', date, {
          ...dayData,
          totals: usageMetrics.totals,
          byUser: usageMetrics.byUser
        });
        count++;
      }

      // If no daily data, save at least the totals for the date range
      if (Object.keys(usageMetrics.byDate).length === 0) {
        await db.saveMetric('cursor', 'daily', startDate, {
          totals: usageMetrics.totals,
          byUser: usageMetrics.byUser
        });
        count++;
      }

      // Fetch and save spend data (monthly)
      try {
        const spend = await cursor.fetchSpend(apiKey);
        const spendMetrics = cursor.parseSpend(spend);
        await db.saveMetric('cursor', 'spend', new Date().toISOString().split('T')[0], spendMetrics);
      } catch (err) {
        console.warn('Failed to fetch spend data:', err.message);
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
      cursor: { aiCodePercent: 0, tabAcceptRate: 0, activeUsers: 0, totalRequests: 0, spendDollars: 0, includedSpendDollars: 0, totalUsageDollars: 0 },
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
    for (const m of cursorMetrics) {
      if (m.metric_type === 'daily' && m.data.totals) {
        // Use latest totals (they're cumulative for the queried period)
        summary.cursor.aiCodePercent = m.data.totals.aiCodePercent || 0;
        summary.cursor.tabAcceptRate = m.data.totals.tabAcceptRate || 0;
        summary.cursor.activeUsers = m.data.totals.activeUsers || 0;
        summary.cursor.totalRequests = m.data.totals.totalRequests || 0;
      }
      if (m.metric_type === 'spend') {
        summary.cursor.spendDollars = m.data.totalSpendDollars || 0;
        summary.cursor.includedSpendDollars = m.data.totalIncludedSpendDollars || 0;
        summary.cursor.totalUsageDollars = m.data.totalUsageDollars || 0;
      }
    }

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

// Team view endpoint - per-user metrics
app.get('/api/dashboard/team', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const allMetrics = await db.getAllMetrics(start, end);
    const cursorMetrics = allMetrics.filter(m => m.source === 'cursor');
    const claudeMetrics = allMetrics.filter(m => m.source === 'claude');

    // Initialize user map with default values
    const userMap = {};
    const initUser = (email) => {
      if (!userMap[email]) {
        userMap[email] = {
          email,
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
          // Status
          isActive: false
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
      totalLinesAdded: u.cursorLinesAdded + u.claudeLinesAdded,
      totalCostDollars: u.cursorSpendDollars + u.cursorIncludedSpendDollars + u.claudeCostDollars
    })).sort((a, b) => b.totalLinesAdded - a.totalLinesAdded);

    res.json({ users });
  } catch (err) {
    console.error('Error generating team view:', err);
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
