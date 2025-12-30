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

    // GitHub metrics
    document.getElementById('cycleTime').textContent =
      data.github.avgCycleTimeHours ? data.github.avgCycleTimeHours.toFixed(1) : '--';
    document.getElementById('prCount').textContent =
      data.github.prCount || '--';

    // Cursor metrics (Admin API)
    document.getElementById('aiCodePercent').textContent =
      data.cursor.aiCodePercent ? data.cursor.aiCodePercent.toFixed(1) + '%' : '--';
    document.getElementById('tabAcceptRate').textContent =
      data.cursor.tabAcceptRate ? data.cursor.tabAcceptRate.toFixed(1) + '%' : '--';
    document.getElementById('cursorActiveUsers').textContent =
      data.cursor.activeUsers || '--';
    document.getElementById('cursorUsage').textContent =
      data.cursor.totalUsageDollars ? '$' + data.cursor.totalUsageDollars.toFixed(2) : '--';

    // Claude Code metrics
    document.getElementById('claudeSessions').textContent =
      data.claude.sessions || '--';
    document.getElementById('claudeCost').textContent =
      data.claude.costDollars ? '$' + data.claude.costDollars.toFixed(2) : '--';

    // Load team view
    loadTeamView(startDate, endDate);
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadTeamView(startDate, endDate) {
  try {
    const res = await fetch(`/api/dashboard/team?startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();

    const tbody = document.getElementById('teamTableBody');

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">No data available</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>${user.email}</td>
        <td>${user.totalLinesAdded.toLocaleString()}</td>
        <td>${user.aiCodePercent.toFixed(1)}%</td>
        <td>${user.tabAcceptRate.toFixed(1)}%</td>
        <td>${user.requests}</td>
        <td>$${user.totalUsageDollars.toFixed(2)}</td>
        <td>${user.isActive ? 'Yes' : 'No'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load team view:', err);
    document.getElementById('teamTableBody').innerHTML =
      '<tr><td colspan="7">Error loading team data</td></tr>';
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
