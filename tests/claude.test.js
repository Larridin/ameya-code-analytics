const { fetchClaudeMetrics, parseClaudeResponse } = require('../lib/claude');

describe('claude', () => {
  describe('parseClaudeResponse', () => {
    it('parses API response into metrics', () => {
      const response = {
        data: [
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev@test.com' },
            terminal_type: 'vscode',
            core_metrics: {
              num_sessions: 5,
              lines_of_code: { added: 100, removed: 50 },
              commits_by_claude_code: 2,
              pull_requests_by_claude_code: 1
            },
            tool_actions: {
              edit_tool: { accepted: 10, rejected: 2 },
              write_tool: { accepted: 5, rejected: 1 },
              notebook_edit_tool: { accepted: 0, rejected: 0 }
            },
            model_breakdown: [
              {
                model: 'claude-sonnet-4',
                tokens: { input: 1000, output: 500, cache_read: 100, cache_creation: 50 },
                estimated_cost: { amount: 150, currency: 'USD' }
              }
            ]
          }
        ],
        has_more: false
      };

      const metrics = parseClaudeResponse(response);

      expect(metrics.users['dev@test.com']).toBeDefined();
      expect(metrics.totals.sessions).toBe(5);
      expect(metrics.totals.linesAdded).toBe(100);
      expect(metrics.totals.costCents).toBe(150);
    });

    it('aggregates multiple users', () => {
      const response = {
        data: [
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev1@test.com' },
            core_metrics: { num_sessions: 3, lines_of_code: { added: 50, removed: 10 } },
            tool_actions: { edit_tool: { accepted: 5, rejected: 1 } },
            model_breakdown: [{ model: 'claude-sonnet-4', estimated_cost: { amount: 100 } }]
          },
          {
            date: '2025-01-01T00:00:00Z',
            actor: { type: 'user_actor', email_address: 'dev2@test.com' },
            core_metrics: { num_sessions: 2, lines_of_code: { added: 30, removed: 5 } },
            tool_actions: { edit_tool: { accepted: 3, rejected: 0 } },
            model_breakdown: [{ model: 'claude-sonnet-4', estimated_cost: { amount: 50 } }]
          }
        ],
        has_more: false
      };

      const metrics = parseClaudeResponse(response);

      expect(metrics.totals.sessions).toBe(5);
      expect(metrics.totals.linesAdded).toBe(80);
      expect(metrics.totals.costCents).toBe(150);
      expect(Object.keys(metrics.users).length).toBe(2);
    });
  });
});
