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
