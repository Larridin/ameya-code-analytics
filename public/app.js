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
