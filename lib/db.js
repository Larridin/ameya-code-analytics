const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/code_analytics'
});

async function saveMetric(source, metricType, date, data) {
  const result = await pool.query(
    `INSERT INTO metrics (source, metric_type, date, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, metric_type, date)
     DO UPDATE SET data = $4, created_at = NOW()
     RETURNING *`,
    [source, metricType, date, JSON.stringify(data)]
  );
  return result.rows[0];
}

async function getMetrics(source, metricType, startDate, endDate) {
  const result = await pool.query(
    `SELECT * FROM metrics
     WHERE source = $1 AND metric_type = $2
     AND date >= $3 AND date <= $4
     ORDER BY date`,
    [source, metricType, startDate, endDate]
  );
  return result.rows;
}

async function getAllMetrics(startDate, endDate) {
  const result = await pool.query(
    `SELECT * FROM metrics
     WHERE date >= $1 AND date <= $2
     ORDER BY source, metric_type, date`,
    [startDate, endDate]
  );
  return result.rows;
}

async function saveConfig(key, value) {
  await pool.query(
    `INSERT INTO config (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

async function getConfig(key) {
  const result = await pool.query(
    'SELECT value FROM config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

async function getIdentityMappings() {
  const result = await pool.query(
    'SELECT email, github_username, created_at, updated_at FROM identity_mappings ORDER BY email'
  );
  return result.rows;
}

async function saveIdentityMapping(email, githubUsername) {
  const result = await pool.query(
    `INSERT INTO identity_mappings (email, github_username, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email)
     DO UPDATE SET github_username = $2, updated_at = NOW()
     RETURNING *`,
    [email, githubUsername]
  );
  return result.rows[0];
}

async function deleteIdentityMapping(email) {
  await pool.query('DELETE FROM identity_mappings WHERE email = $1', [email]);
}

module.exports = { pool, saveMetric, getMetrics, getAllMetrics, saveConfig, getConfig, getIdentityMappings, saveIdentityMapping, deleteIdentityMapping };
