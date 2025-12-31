const http = require('http');

const BASE_URL = 'http://localhost:3001';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('server', () => {
  let server;

  beforeAll((done) => {
    process.env.PORT = '3001';
    server = require('../server');
    setTimeout(done, 500); // wait for server to start
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/health', () => {
    it('returns ok', async () => {
      const res = await request('GET', '/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/metrics', () => {
    it('returns metrics from database', async () => {
      const res = await request('GET', '/api/metrics?startDate=2025-01-01&endDate=2025-01-31');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Identity Mappings API', () => {
    const testEmail = 'api-test@example.com';
    const testUsername = 'api-test-user';

    afterAll(async () => {
      await request('DELETE', `/api/identity-mappings/${encodeURIComponent(testEmail)}`);
    });

    it('POST creates a mapping', async () => {
      const res = await request('POST', '/api/identity-mappings', {
        email: testEmail,
        githubUsername: testUsername
      });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testEmail);
    });

    it('GET returns all mappings', async () => {
      const res = await request('GET', '/api/identity-mappings');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE removes a mapping', async () => {
      const res = await request('DELETE', `/api/identity-mappings/${encodeURIComponent(testEmail)}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/dashboard/ai-metrics', () => {
    it('returns ai metrics structure', async () => {
      const res = await request('GET', '/api/dashboard/ai-metrics?startDate=2025-01-01&endDate=2025-01-31');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('toolBreakdown');
      expect(res.body).toHaveProperty('byUser');
    });
  });

  describe('GET /api/dashboard/ai-metrics/daily', () => {
    it('returns daily metrics arrays', async () => {
      const res = await request('GET', '/api/dashboard/ai-metrics/daily?startDate=2025-01-01&endDate=2025-01-31');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('dates');
      expect(res.body).toHaveProperty('series');
      expect(res.body.series).toHaveProperty('linesShipped');
      expect(res.body.series).toHaveProperty('linesRemoved');
      expect(res.body.series).toHaveProperty('aiPercent');
      expect(res.body.series).toHaveProperty('costCents');
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.dates)).toBe(true);
    });
  });
});
