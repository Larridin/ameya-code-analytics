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
