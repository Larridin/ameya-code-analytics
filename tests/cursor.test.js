const {
  parseCursorCommits,
  parseCursorDau,
  cursorAdminRequest,
  fetchDailyUsage,
  parseDailyUsage,
  fetchSpend,
  parseSpend
} = require('../lib/cursor');

// Legacy tests for Enterprise API (keep for reference)
describe('cursor legacy', () => {
  describe('parseCursorCommits', () => {
    it('calculates AI attribution from commits', () => {
      const response = {
        data: [
          {
            commitHash: 'abc123',
            userEmail: 'dev@test.com',
            totalLinesAdded: 100,
            tabLinesAdded: 40,
            composerLinesAdded: 30,
            nonAiLinesAdded: 30
          },
          {
            commitHash: 'def456',
            userEmail: 'dev@test.com',
            totalLinesAdded: 50,
            tabLinesAdded: 25,
            composerLinesAdded: 15,
            nonAiLinesAdded: 10
          }
        ]
      };

      const metrics = parseCursorCommits(response);

      expect(metrics.totals.totalLines).toBe(150);
      expect(metrics.totals.tabLines).toBe(65);
      expect(metrics.totals.composerLines).toBe(45);
      expect(metrics.totals.aiPercent).toBeCloseTo(73.3, 1);
    });
  });

  describe('parseCursorDau', () => {
    it('parses DAU response', () => {
      const response = {
        data: [
          { date: '2025-01-01', dau: 10 },
          { date: '2025-01-02', dau: 12 }
        ]
      };

      const metrics = parseCursorDau(response);

      expect(metrics.byDate['2025-01-01']).toBe(10);
      expect(metrics.byDate['2025-01-02']).toBe(12);
      expect(metrics.avgDau).toBe(11);
    });
  });
});

// New Admin API tests
describe('cursor Admin API', () => {
  const apiKey = process.env.CURSOR_API_KEY;

  describe('cursorAdminRequest', () => {
    it('sends POST request with JSON body and Basic auth', async () => {
      if (!apiKey) {
        console.log('Skipping integration test: CURSOR_API_KEY not set');
        return;
      }

      const startDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const endDate = Date.now();

      const result = await cursorAdminRequest(apiKey, '/teams/daily-usage-data', {
        startDate,
        endDate
      });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('period');
    });
  });

  describe('fetchDailyUsage', () => {
    it('fetches daily usage for date range', async () => {
      if (!apiKey) {
        console.log('Skipping integration test: CURSOR_API_KEY not set');
        return;
      }

      const startDate = '2025-12-01';
      const endDate = '2025-12-07';

      const result = await fetchDailyUsage(apiKey, startDate, endDate);

      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result).toHaveProperty('period');
    });

    it('throws error if date range exceeds 30 days', async () => {
      await expect(
        fetchDailyUsage(apiKey || 'fake', '2025-01-01', '2025-03-01')
      ).rejects.toThrow('Date range cannot exceed 30 days');
    });
  });

  describe('parseDailyUsage', () => {
    it('calculates AI code percentage', () => {
      const response = {
        data: [
          {
            email: 'dev@test.com',
            date: 1735689600000,
            isActive: true,
            totalLinesAdded: 1000,
            acceptedLinesAdded: 700,
            totalTabsShown: 100,
            totalTabsAccepted: 85,
            composerRequests: 10,
            chatRequests: 20,
            agentRequests: 5
          }
        ]
      };

      const result = parseDailyUsage(response);

      expect(result.totals.aiCodePercent).toBe(70);
      expect(result.totals.tabAcceptRate).toBe(85);
      expect(result.totals.totalRequests).toBe(35);
      expect(result.totals.activeUsers).toBe(1);
    });

    it('aggregates multiple users', () => {
      const response = {
        data: [
          {
            email: 'dev1@test.com',
            isActive: true,
            totalLinesAdded: 500,
            acceptedLinesAdded: 300,
            totalTabsShown: 50,
            totalTabsAccepted: 40
          },
          {
            email: 'dev2@test.com',
            isActive: true,
            totalLinesAdded: 500,
            acceptedLinesAdded: 400,
            totalTabsShown: 50,
            totalTabsAccepted: 45
          }
        ]
      };

      const result = parseDailyUsage(response);

      expect(result.totals.aiCodePercent).toBe(70);
      expect(result.totals.activeUsers).toBe(2);
      expect(Object.keys(result.byUser).length).toBe(2);
      // Check per-user metrics
      expect(result.byUser['dev1@test.com'].aiCodePercent).toBe(60);
      expect(result.byUser['dev2@test.com'].aiCodePercent).toBe(80);
    });

    it('counts unique active users across multiple days', () => {
      const response = {
        data: [
          { email: 'dev@test.com', date: 1735689600000, isActive: true, totalLinesAdded: 100 },
          { email: 'dev@test.com', date: 1735776000000, isActive: true, totalLinesAdded: 100 },
          { email: 'dev@test.com', date: 1735862400000, isActive: true, totalLinesAdded: 100 }
        ]
      };

      const result = parseDailyUsage(response);

      // Same user active on 3 days should count as 1 unique active user
      expect(result.totals.activeUsers).toBe(1);
      expect(result.byUser['dev@test.com'].totalLinesAdded).toBe(300);
    });

    it('handles zero lines gracefully', () => {
      const response = {
        data: [{ email: 'dev@test.com', totalLinesAdded: 0, acceptedLinesAdded: 0 }]
      };

      const result = parseDailyUsage(response);

      expect(result.totals.aiCodePercent).toBe(0);
    });

    it('handles empty response', () => {
      const response = { data: [] };

      const result = parseDailyUsage(response);

      expect(result.totals.aiCodePercent).toBe(0);
      expect(result.totals.activeUsers).toBe(0);
    });
  });

  describe('fetchSpend', () => {
    it('fetches current month spend data', async () => {
      if (!apiKey) {
        console.log('Skipping integration test: CURSOR_API_KEY not set');
        return;
      }

      const result = await fetchSpend(apiKey);

      expect(result).toHaveProperty('teamMemberSpend');
      expect(Array.isArray(result.teamMemberSpend)).toBe(true);
    });
  });

  describe('parseSpend', () => {
    it('aggregates spend and included spend across users', () => {
      const response = {
        teamMemberSpend: [
          { email: 'dev1@test.com', spendCents: 1000, includedSpendCents: 500, fastPremiumRequests: 50 },
          { email: 'dev2@test.com', spendCents: 2000, includedSpendCents: 1500, fastPremiumRequests: 100 }
        ]
      };

      const result = parseSpend(response);

      expect(result.totalSpendCents).toBe(3000);
      expect(result.totalSpendDollars).toBe(30);
      expect(result.totalIncludedSpendCents).toBe(2000);
      expect(result.totalIncludedSpendDollars).toBe(20);
      expect(result.totalUsageDollars).toBe(50);
      expect(result.byUser['dev1@test.com'].spendCents).toBe(1000);
      expect(result.byUser['dev1@test.com'].includedSpendDollars).toBe(5);
      expect(result.byUser['dev2@test.com'].spendDollars).toBe(20);
    });

    it('handles zero overage with included usage', () => {
      const response = {
        teamMemberSpend: [
          { email: 'dev@test.com', spendCents: 0, includedSpendCents: 7000 }
        ]
      };

      const result = parseSpend(response);

      expect(result.totalSpendDollars).toBe(0);
      expect(result.totalIncludedSpendDollars).toBe(70);
      expect(result.totalUsageDollars).toBe(70);
    });

    it('handles empty spend data', () => {
      const response = { teamMemberSpend: [] };

      const result = parseSpend(response);

      expect(result.totalSpendCents).toBe(0);
      expect(result.totalSpendDollars).toBe(0);
      expect(result.totalIncludedSpendDollars).toBe(0);
      expect(result.totalUsageDollars).toBe(0);
    });
  });
});
