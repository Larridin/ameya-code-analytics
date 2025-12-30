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
