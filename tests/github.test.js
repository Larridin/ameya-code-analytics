const { parsePRs, calculateCycleTime } = require('../lib/github');

describe('github', () => {
  describe('calculateCycleTime', () => {
    it('calculates hours between created and merged', () => {
      const pr = {
        created_at: '2025-01-01T10:00:00Z',
        merged_at: '2025-01-01T14:00:00Z'
      };
      expect(calculateCycleTime(pr)).toBe(4);
    });

    it('returns null for unmerged PRs', () => {
      const pr = { created_at: '2025-01-01T10:00:00Z', merged_at: null };
      expect(calculateCycleTime(pr)).toBeNull();
    });
  });

  describe('parsePRs', () => {
    it('aggregates PR metrics', () => {
      const prs = [
        {
          number: 1,
          user: { login: 'dev1' },
          created_at: '2025-01-01T10:00:00Z',
          merged_at: '2025-01-01T14:00:00Z',
          comments: 3
        },
        {
          number: 2,
          user: { login: 'dev2' },
          created_at: '2025-01-01T08:00:00Z',
          merged_at: '2025-01-01T20:00:00Z',
          comments: 5
        },
        {
          number: 3,
          user: { login: 'dev1' },
          created_at: '2025-01-01T10:00:00Z',
          merged_at: null,
          comments: 0
        }
      ];

      const metrics = parsePRs(prs);

      expect(metrics.totals.prCount).toBe(3);
      expect(metrics.totals.mergedCount).toBe(2);
      expect(metrics.totals.avgCycleTimeHours).toBe(8); // (4 + 12) / 2
      expect(metrics.byAuthor['dev1'].prCount).toBe(2);
      expect(metrics.byAuthor['dev2'].prCount).toBe(1);
    });
  });
});
