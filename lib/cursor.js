const https = require('https');

// ============================================
// Legacy Enterprise API functions (kept for reference)
// ============================================

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

// ============================================
// New Admin API functions (Teams plan compatible)
// ============================================

/**
 * Make a POST request to Cursor Admin API
 * @param {string} apiKey - Cursor Admin API key
 * @param {string} endpoint - API endpoint (e.g., '/teams/daily-usage-data')
 * @param {object} body - Request body
 * @returns {Promise<object>} - API response
 */
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

/**
 * Fetch daily usage data from Cursor Admin API
 * @param {string} apiKey - Cursor Admin API key
 * @param {string} startDate - Start date in ISO format (YYYY-MM-DD)
 * @param {string} endDate - End date in ISO format (YYYY-MM-DD)
 * @returns {Promise<object>} - Daily usage data
 */
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

/**
 * Parse daily usage response into aggregated metrics
 * @param {object} response - Raw API response
 * @returns {object} - Parsed metrics with totals, byUser, byDate
 */
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
    const dateKey = record.date
      ? new Date(record.date).toISOString().split('T')[0]
      : 'unknown';

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
        requests: 0,
        isActive: false
      };
    }
    byUser[email].totalLinesAdded += record.totalLinesAdded || 0;
    byUser[email].acceptedLinesAdded += record.acceptedLinesAdded || 0;
    byUser[email].totalTabsShown += record.totalTabsShown || 0;
    byUser[email].totalTabsAccepted += record.totalTabsAccepted || 0;
    byUser[email].requests += (record.composerRequests || 0) +
                              (record.chatRequests || 0) +
                              (record.agentRequests || 0);
    if (record.isActive) byUser[email].isActive = true;

    // By date
    if (dateKey !== 'unknown') {
      if (!byDate[dateKey]) {
        byDate[dateKey] = { linesAdded: 0, acceptedLines: 0, activeUsers: 0 };
      }
      byDate[dateKey].linesAdded += record.totalLinesAdded || 0;
      byDate[dateKey].acceptedLines += record.acceptedLinesAdded || 0;
      if (record.isActive) byDate[dateKey].activeUsers++;
    }
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

/**
 * Fetch spend data for current month
 * @param {string} apiKey - Cursor Admin API key
 * @returns {Promise<object>} - Spend data by team member
 */
async function fetchSpend(apiKey) {
  return cursorAdminRequest(apiKey, '/teams/spend', {});
}

/**
 * Parse spend response into aggregated metrics
 * @param {object} response - Raw API response
 * @returns {object} - Parsed spend metrics
 */
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

module.exports = {
  // Legacy Enterprise API
  parseCursorCommits,
  parseCursorDau,
  cursorRequest,
  fetchCursorCommits,
  fetchCursorDau,
  fetchCursorAgentEdits,
  // New Admin API
  cursorAdminRequest,
  fetchDailyUsage,
  parseDailyUsage,
  fetchSpend,
  parseSpend
};
