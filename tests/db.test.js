const { pool, saveMetric, getMetrics, saveConfig, getConfig } = require('../lib/db');

describe('db', () => {
  beforeAll(async () => {
    // Clean test data
    await pool.query("DELETE FROM metrics WHERE source = 'test'");
    await pool.query("DELETE FROM config WHERE key LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('saveMetric', () => {
    it('saves a metric to the database', async () => {
      const result = await saveMetric('test', 'test_metric', '2025-01-01', { value: 42 });
      expect(result.source).toBe('test');
      expect(result.data.value).toBe(42);
    });

    it('upserts on conflict', async () => {
      await saveMetric('test', 'test_metric', '2025-01-01', { value: 100 });
      const metrics = await getMetrics('test', 'test_metric', '2025-01-01', '2025-01-01');
      expect(metrics[0].data.value).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('returns metrics for date range', async () => {
      await saveMetric('test', 'range_test', '2025-01-01', { day: 1 });
      await saveMetric('test', 'range_test', '2025-01-02', { day: 2 });
      await saveMetric('test', 'range_test', '2025-01-03', { day: 3 });

      const metrics = await getMetrics('test', 'range_test', '2025-01-01', '2025-01-02');
      expect(metrics.length).toBe(2);
    });
  });

  describe('config', () => {
    it('saves and retrieves config', async () => {
      await saveConfig('test_key', 'test_value');
      const value = await getConfig('test_key');
      expect(value).toBe('test_value');
    });
  });
});
