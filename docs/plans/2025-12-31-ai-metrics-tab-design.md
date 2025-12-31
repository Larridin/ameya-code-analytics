# AI Metrics Tab Design

## Overview

Add a new "AI Metrics" tab to the dashboard that shows combined AI contribution metrics across GitHub, Claude Code, and Cursor. Leaders see unified metrics first, with ability to drill down by user and by tool.

## Tab Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Combined Summary Cards (7 metrics)                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Lines   │ │ Merged  │ │ AI %    │ │ AI PRs  │           │
│  │ Shipped │ │ PRs     │ │ (est)   │ │ (proven)│           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │ Total   │ │ Cycle   │ │ Lines   │                       │
│  │ Cost    │ │ Time    │ │ Removed │                       │
│  └─────────┘ └─────────┘ └─────────┘                       │
├─────────────────────────────────────────────────────────────┤
│  Tool Breakdown Cards (side by side)                        │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ Claude Code          │  │ Cursor               │        │
│  │ Lines: 2,200         │  │ Lines: 2,700 (63% AI)│        │
│  │ Sessions: 45         │  │ Accept Rate: 76%     │        │
│  │ Accept Rate: 85%     │  │ Cost: $35            │        │
│  │ Cost: $45            │  │                      │        │
│  │ PRs Created: 11      │  │                      │        │
│  └──────────────────────┘  └──────────────────────┘        │
├─────────────────────────────────────────────────────────────┤
│  Developer Breakdown Table                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ User │ Lines │ AI% │ PRs │ AI PRs │ Cost │ Cycle Time  ││
│  │──────│───────│─────│─────│────────│──────│─────────────││
│  │ ▶ alice@... │ 2400 │ 78% │ 8 │ 6 (75%)│ $42 │ 8.2h     ││
│  │ ▶ bob@...   │ 1800 │ 82% │ 6 │ 5 (83%)│ $38 │ 12.1h    ││
│  └─────────────────────────────────────────────────────────┘│
│  (Click row ▶ to expand tool breakdown)                     │
└─────────────────────────────────────────────────────────────┘
```

## Summary Metrics (7 Cards)

| Metric | Description | Source |
|--------|-------------|--------|
| Lines Shipped | Lines added in merged PRs | GitHub |
| Lines Removed | Lines removed in merged PRs | GitHub |
| Merged PRs | Count of merged PRs | GitHub |
| Cycle Time | Avg hours from PR open to merge | GitHub |
| AI % (est) | Estimated % of shipped lines from AI | Derived |
| AI PRs (proven) | % of PRs with confirmed AI tool usage | Claude |
| Total Cost | Combined AI tool spend | Claude + Cursor |

## Tool Breakdown Cards

**Claude Code:**
- Lines added/removed (100% AI)
- Sessions count
- Acceptance rate (edit + write accepts / total)
- Cost
- PRs created via Claude

**Cursor:**
- Lines added (total and AI accepted)
- AI percentage
- Acceptance rate (tabs + applies)
- Cost

## Developer Table Columns

| Column | Description |
|--------|-------------|
| User | Email (from identity mappings) |
| Lines Shipped | PR lines added (GitHub) |
| AI % | Estimated AI contribution |
| PRs | Merged PR count |
| AI PRs | PRs with AI attribution (count + %) |
| Cost | Combined Claude + Cursor cost |
| Cycle Time | Avg hours to merge |

**Expanded row shows:**
- Claude: sessions, lines, acceptance rate, cost, PRs created
- Cursor: lines (total/AI), AI%, acceptance rate, cost

## Backend Changes

### GitHub Enhancement

During backfill, for each merged PR, fetch individual PR details to get `additions` and `deletions`:
- Endpoint: `GET /repos/{owner}/{repo}/pulls/{number}`
- Only fetch for merged PRs (reduces API calls)
- Store `prLinesAdded` and `prLinesRemoved` per author in daily metrics

### New API Endpoint

`GET /api/dashboard/ai-metrics?startDate=X&endDate=Y`

Returns:
```json
{
  "summary": {
    "prLinesAdded": 4200,
    "prLinesRemoved": 890,
    "mergedCount": 14,
    "avgCycleTimeHours": 9.8,
    "aiShippedPercent": 80.0,
    "aiAttributedPrPercent": 79.0,
    "costCents": 8000
  },
  "toolBreakdown": {
    "claude": {
      "sessions": 45,
      "linesAdded": 2200,
      "linesRemoved": 680,
      "acceptanceRate": 0.85,
      "costCents": 4500,
      "prsCreated": 11
    },
    "cursor": {
      "totalLinesAdded": 2700,
      "acceptedLinesAdded": 1706,
      "aiPercent": 63.2,
      "acceptanceRate": 0.76,
      "costCents": 3500
    }
  },
  "byUser": {
    "alice@company.com": {
      "prLinesAdded": 2400,
      "mergedCount": 8,
      "avgCycleTimeHours": 8.2,
      "aiShippedPercent": 78.0,
      "prsWithAiAttribution": 6,
      "aiAttributedPrPercent": 75.0,
      "costCents": 4200,
      "claude": { ... },
      "cursor": { ... }
    }
  }
}
```

### Aggregation Logic

1. Fetch GitHub metrics (with PR line stats)
2. Fetch Claude metrics (lines, PRs created, cost)
3. Fetch Cursor metrics (lines total/AI, cost)
4. Use identity mappings to join users across tools
5. Calculate derived metrics:
   - `aiShippedPercent = prLinesAdded × (aiLines / editorLines)`
   - `aiAttributedPrPercent = prsWithAiAttribution / mergedCount`

### Data Storage

Uses existing schema - daily records per source:
```sql
metrics (source, metric_type, date, data JSONB)
```

GitHub daily record gains `prLinesAdded`, `prLinesRemoved` in JSONB.
No schema changes required.

## Frontend Changes

### HTML
- Add "AI Metrics" button to tab bar
- Add `#ai-metrics-tab` content section with:
  - Summary cards grid
  - Tool breakdown cards (side by side)
  - Developer table with expandable rows

### CSS
- `.tool-card` styling for Claude/Cursor breakdown
- Expand/collapse arrow and nested row styles
- Reuse existing `.metric-card` patterns

### JavaScript
- `loadAiMetrics()` - fetch from new endpoint, render all sections
- `toggleUserExpand(email)` - expand/collapse tool detail row
- Load on tab switch

## Files to Modify

| File | Change |
|------|--------|
| `lib/github.js` | Add `fetchPRDetails()` to get lines for merged PRs |
| `server.js` | Update GitHub backfill to fetch PR line stats |
| `server.js` | Add `GET /api/dashboard/ai-metrics` endpoint |
| `public/index.html` | Add AI Metrics tab button + content section |
| `public/style.css` | Add tool card and expand/collapse styles |
| `public/app.js` | Add `loadAiMetrics()`, `toggleUserExpand()` |
| `tests/github.test.js` | Add tests for PR line stats |
| `tests/server.test.js` | Add tests for ai-metrics endpoint |

## Key Assumptions

1. **Claude Code = 100% AI** - All lines from Claude Code are AI-generated
2. **Proxy ratio is directional** - `aiShippedPercent` assumes editor AI ratio ≈ shipped AI ratio
3. **Identity mappings required** - Tool emails mapped to canonical user via existing mappings feature
4. **Cursor has no PR attribution** - Only Claude provides `pull_requests_by_claude_code`
