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
