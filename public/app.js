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
      tbody.innerHTML = '<tr><td colspan="14">No data available</td></tr>';
      return;
    }

    const formatCycleTime = (hours) => {
      if (!hours) return '--';
      if (hours < 1) return `${Math.round(hours * 60)}m`;
      if (hours < 24) return `${hours.toFixed(1)}h`;
      return `${(hours / 24).toFixed(1)}d`;
    };

    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>${user.identifier}</td>
        <td>${user.githubPrCount || '--'}</td>
        <td>${formatCycleTime(user.githubAvgCycleTimeHours)}</td>
        <td>${user.githubCommentsReceived || '--'}</td>
        <td>${user.githubCommentsMade || '--'}</td>
        <td>${user.cursorLinesAdded.toLocaleString()}</td>
        <td>${user.cursorAiCodePercent.toFixed(1)}%</td>
        <td>${user.cursorTabAcceptRate.toFixed(1)}%</td>
        <td>${user.cursorRequests}</td>
        <td>$${user.cursorTotalUsageDollars.toFixed(2)}</td>
        <td>${user.claudeSessions}</td>
        <td>${user.claudeLinesAdded.toLocaleString()}</td>
        <td>$${user.claudeCostDollars.toFixed(2)}</td>
        <td>$${user.totalCostDollars.toFixed(2)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load team view:', err);
    document.getElementById('teamTableBody').innerHTML =
      '<tr><td colspan="14">Error loading team data</td></tr>';
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

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tab.dataset.tab + '-tab').classList.add('active');

    // Load mappings when switching to that tab
    if (tab.dataset.tab === 'mappings') {
      loadMappings();
    }
  });
});

// Mappings management
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadMappings() {
  try {
    const res = await fetch('/api/identity-mappings');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const mappings = await res.json();

    const tbody = document.getElementById('mappingsTableBody');

    if (mappings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">No mappings configured</td></tr>';
      return;
    }

    tbody.innerHTML = mappings.map(m => `
      <tr>
        <td>${escapeHtml(m.email)}</td>
        <td>${escapeHtml(m.github_username)}</td>
        <td>
          <button class="delete-btn" onclick="deleteMapping(&quot;${escapeHtml(m.email)}&quot;)">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load mappings:', err);
    document.getElementById('mappingsTableBody').innerHTML =
      '<tr><td colspan="3">Error loading mappings</td></tr>';
  }
}

async function addMapping() {
  const email = document.getElementById('mappingEmail').value.trim();
  const githubUsername = document.getElementById('mappingGithub').value.trim();
  const statusEl = document.getElementById('mappingStatus');

  if (!email || !githubUsername) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Both email and GitHub username are required';
    return;
  }

  try {
    const res = await fetch('/api/identity-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, githubUsername })
    });

    const data = await res.json();

    if (res.ok) {
      statusEl.className = 'status success';
      statusEl.textContent = 'Mapping added successfully';
      document.getElementById('mappingEmail').value = '';
      document.getElementById('mappingGithub').value = '';
      loadMappings();
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + data.error;
    }
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Error: ' + err.message;
  }
}

async function deleteMapping(email) {
  if (!confirm(`Delete mapping for ${email}?`)) return;

  try {
    const res = await fetch(`/api/identity-mappings/${encodeURIComponent(email)}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      loadMappings();
    } else {
      const data = await res.json();
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Pre-fill mapping form from URL params (for unmapped user click)
function prefillMappingForm(githubUsername) {
  document.querySelector('[data-tab="mappings"]').click();
  document.getElementById('mappingGithub').value = githubUsername;
  document.getElementById('mappingEmail').focus();
}
