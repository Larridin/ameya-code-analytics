const { parseCursorCommits, parseCursorDau } = require('../lib/cursor');

describe('cursor', () => {
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
