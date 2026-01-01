// Initialize dates
const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// Chart instances
let linesChart = null;
let aiPercentChart = null;
let costChart = null;

document.getElementById('startDate').value = thirtyDaysAgo;
document.getElementById('endDate').value = today;
document.getElementById('backfillStart').value = thirtyDaysAgo;
document.getElementById('backfillEnd').value = today;
document.getElementById('aiMetricsStartDate').value = thirtyDaysAgo;
document.getElementById('aiMetricsEndDate').value = today;

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

    tbody.innerHTML = data.users.map(user => {
      const rowClass = user.isUnmapped ? 'user-unmapped' : '';
      const userCell = user.isUnmapped
        ? `<span class="unmapped-indicator" data-username="${escapeHtml(user.identifier)}" title="Click to add mapping">⚠️</span>${escapeHtml(user.identifier)}`
        : escapeHtml(user.identifier);

      return `
        <tr class="${rowClass}">
          <td>${userCell}</td>
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
      `;
    }).join('');
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

    // Load data when switching tabs
    if (tab.dataset.tab === 'mappings') {
      loadMappings();
    } else if (tab.dataset.tab === 'ai-metrics') {
      loadAiMetrics();
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

async function loadAiMetrics() {
  const startDate = document.getElementById('aiMetricsStartDate').value;
  const endDate = document.getElementById('aiMetricsEndDate').value;

  try {
    const res = await fetch(`/api/dashboard/ai-metrics?startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load AI metrics');
    }

    // Summary cards
    document.getElementById('aiLinesShipped').textContent = data.summary.prLinesAdded.toLocaleString();
    document.getElementById('aiLinesRemoved').textContent = data.summary.prLinesRemoved.toLocaleString();
    document.getElementById('aiMergedPrs').textContent = data.summary.mergedCount;
    document.getElementById('aiCycleTime').textContent = data.summary.avgCycleTimeHours.toFixed(1);
    document.getElementById('aiShippedPercent').textContent = data.summary.aiShippedPercent.toFixed(1) + '%';
    document.getElementById('aiAttributedPrPercent').textContent = data.summary.aiAttributedPrPercent.toFixed(1) + '%';
    document.getElementById('aiTotalCost').textContent = '$' + (data.summary.costCents / 100).toFixed(2);

    // Tool breakdown - Claude
    const claude = data.toolBreakdown.claude;
    document.getElementById('claudeLines').textContent = claude.linesAdded.toLocaleString();
    document.getElementById('aiClaudeSessions').textContent = claude.sessions;
    document.getElementById('claudeAcceptRate').textContent = (claude.acceptanceRate * 100).toFixed(1) + '%';
    document.getElementById('aiClaudeCost').textContent = '$' + (claude.costCents / 100).toFixed(2);
    document.getElementById('claudePrsCreated').textContent = claude.prsCreated;

    // Tool breakdown - Cursor
    const cursor = data.toolBreakdown.cursor;
    document.getElementById('cursorLines').textContent = cursor.totalLinesAdded.toLocaleString() + ' (' + cursor.aiPercent.toFixed(0) + '% AI)';
    document.getElementById('cursorAiPercent').textContent = cursor.aiPercent.toFixed(1) + '%';
    document.getElementById('cursorAcceptRate').textContent = (cursor.acceptanceRate * 100).toFixed(1) + '%';
    document.getElementById('cursorCost').textContent = '$' + (cursor.costCents / 100).toFixed(2);

    // User table
    renderAiUserTable(data.byUser);

    // Load trend charts
    loadTrendsCharts();
  } catch (err) {
    console.error('Failed to load AI metrics:', err);
    document.getElementById('aiUserTableBody').innerHTML =
      '<tr><td colspan="6">Error loading AI metrics</td></tr>';
  }
}

async function loadTrendsCharts() {
  const startDate = document.getElementById('aiMetricsStartDate').value;
  const endDate = document.getElementById('aiMetricsEndDate').value;
  const userSelect = document.getElementById('trendsUserSelect');
  const selectedUser = userSelect.value;

  try {
    let url = `/api/dashboard/ai-metrics/daily?startDate=${startDate}&endDate=${endDate}`;
    if (selectedUser) {
      url += `&user=${encodeURIComponent(selectedUser)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load trends data');
    }

    // Populate user dropdown (only on initial load)
    if (!selectedUser && data.users) {
      const currentValue = userSelect.value;
      userSelect.innerHTML = '<option value="">All Team</option>' +
        data.users.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
      userSelect.value = currentValue;
    }

    // Render charts
    renderLinesChart(data.dates, data.series);
    renderAiPercentChart(data.dates, data.series);
    renderCostChart(data.dates, data.series);
  } catch (err) {
    console.error('Failed to load trends:', err);
  }
}

function renderLinesChart(dates, series) {
  const ctx = document.getElementById('linesChart').getContext('2d');

  if (linesChart) {
    linesChart.destroy();
  }

  linesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Lines Shipped',
          data: series.linesShipped,
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Lines Removed',
          data: series.linesRemoved,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderAiPercentChart(dates, series) {
  const ctx = document.getElementById('aiPercentChart').getContext('2d');

  if (aiPercentChart) {
    aiPercentChart.destroy();
  }

  aiPercentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'AI %',
        data: series.aiPercent,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, max: 100 }
      }
    }
  });
}

function renderCostChart(dates, series) {
  const ctx = document.getElementById('costChart').getContext('2d');

  if (costChart) {
    costChart.destroy();
  }

  // Convert cents to dollars
  const costDollars = series.costCents.map(c => c / 100);

  costChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Cost ($)',
        data: costDollars,
        backgroundColor: '#f39c12'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderAiUserTable(byUser) {
  const tbody = document.getElementById('aiUserTableBody');
  const users = Object.entries(byUser).sort((a, b) => b[1].prLinesAdded - a[1].prLinesAdded);

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No data available</td></tr>';
    return;
  }

  const formatCycleTime = (hours) => {
    if (!hours) return '--';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  tbody.innerHTML = users.map(([email, user]) => {
    const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
    return `
    <tr class="expandable-row" data-email="${escapeHtml(email)}">
      <td><span class="expand-icon" id="expand-${safeId}">▶</span> ${escapeHtml(email)}</td>
      <td>${user.prLinesAdded.toLocaleString()}</td>
      <td>${user.aiShippedPercent.toFixed(1)}%</td>
      <td>${user.mergedCount}</td>
      <td>$${(user.costCents / 100).toFixed(2)}</td>
      <td>${formatCycleTime(user.avgCycleTimeHours)}</td>
    </tr>
    <tr class="expanded-content" id="detail-${safeId}" style="display: none;">
      <td colspan="6">
        <div class="tool-detail">
          <div class="tool-detail-section">
            <h4>Claude Code</h4>
            <div>Lines: ${user.claude.linesAdded.toLocaleString()}</div>
            <div>Sessions: ${user.claude.sessions}</div>
            <div>Cost: $${(user.claude.costCents / 100).toFixed(2)}</div>
          </div>
          <div class="tool-detail-section">
            <h4>Cursor</h4>
            <div>Lines: ${user.cursor.totalLines.toLocaleString()} (${user.cursor.aiPercent.toFixed(0)}% AI)</div>
            <div>AI Lines: ${user.cursor.acceptedLines.toLocaleString()}</div>
            <div>Cost: $${(user.cursor.costCents / 100).toFixed(2)}</div>
          </div>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function toggleAiUserExpand(email) {
  const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const icon = document.getElementById(`expand-${safeId}`);
  const detail = document.getElementById(`detail-${safeId}`);

  if (detail.style.display === 'none') {
    detail.style.display = 'table-row';
    icon.classList.add('expanded');
  } else {
    detail.style.display = 'none';
    icon.classList.remove('expanded');
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

// Event delegation for unmapped user indicator clicks
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('unmapped-indicator')) {
    const username = e.target.dataset.username;
    if (username) {
      prefillMappingForm(username);
    }
  }
});

// Event delegation for expandable AI user rows
document.addEventListener('click', (e) => {
  const row = e.target.closest('.expandable-row');
  if (row && row.dataset.email) {
    toggleAiUserExpand(row.dataset.email);
  }
});
