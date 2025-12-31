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

    it('tracks comments received and made', () => {
      const prs = [
        { number: 1, user: { login: 'author1' }, created_at: '2025-01-01T10:00:00Z' },
        { number: 2, user: { login: 'author2' }, created_at: '2025-01-01T10:00:00Z' }
      ];

      const comments = [
        { user: { login: 'reviewer1' }, pull_request_url: 'https://api.github.com/repos/org/repo/pulls/1' },
        { user: { login: 'reviewer1' }, pull_request_url: 'https://api.github.com/repos/org/repo/pulls/1' },
        { user: { login: 'author1' }, pull_request_url: 'https://api.github.com/repos/org/repo/pulls/1' }, // self-comment
        { user: { login: 'reviewer2' }, pull_request_url: 'https://api.github.com/repos/org/repo/pulls/2' }
      ];

      const metrics = parsePRs(prs, comments);

      // author1 received 2 comments from reviewer1 (not counting self-comment)
      expect(metrics.byAuthor['author1'].commentsReceived).toBe(2);
      // author2 received 1 comment from reviewer2
      expect(metrics.byAuthor['author2'].commentsReceived).toBe(1);
      // reviewer1 made 2 comments
      expect(metrics.byAuthor['reviewer1'].commentsMade).toBe(2);
      // author1 made 1 comment (on own PR)
      expect(metrics.byAuthor['author1'].commentsMade).toBe(1);
    });
  });
});
