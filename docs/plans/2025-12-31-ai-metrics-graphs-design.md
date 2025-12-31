# AI Metrics Graphs Design

## Overview

Add daily trend graphs to the AI Metrics tab showing metrics over time for the team and individual users.

## UI Layout

New "Trends" section between Tool Breakdown and Developer Breakdown:

```
┌─────────────────────────────────────────────────────────┐
│  Summary Cards (existing)                                │
├─────────────────────────────────────────────────────────┤
│  Tool Breakdown (existing)                               │
├─────────────────────────────────────────────────────────┤
│  Trends                                                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │ [Dropdown: All Team ▼]                              ││
│  ├─────────────────────────────────────────────────────┤│
│  │ Lines Shipped / Removed     (line chart)            ││
│  ├─────────────────────────────────────────────────────┤│
│  │ AI % (estimated)            (line chart)            ││
│  ├─────────────────────────────────────────────────────┤│
│  │ Cost                        (bar chart)             ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Developer Breakdown Table (existing)                    │
└─────────────────────────────────────────────────────────┘
```

- 3 small charts stacked vertically (~200px height each)
- Dropdown defaults to "All Team", lists individual users
- Charts use same date range as tab's date picker

## API Endpoint

**New endpoint:** `GET /api/dashboard/ai-metrics/daily?startDate=X&endDate=Y&user=email`

- `user` param optional - omit for team totals, provide email for individual

**Response:**
```json
{
  "dates": ["2025-12-01", "2025-12-02", ...],
  "series": {
    "linesShipped": [1200, 800, 1500, ...],
    "linesRemoved": [300, 200, 400, ...],
    "aiPercent": [58.2, 62.1, 55.0, ...],
    "costCents": [4500, 3200, 5100, ...]
  },
  "users": ["alice@company.com", "bob@company.com", ...]
}
```

- `dates` - X-axis labels
- `series` - Arrays aligned with dates for Chart.js
- `users` - Available users for dropdown (only when user param omitted)

## Frontend Implementation

**Chart.js:** Load via CDN in index.html

**Charts:**
| Chart | Type | Data |
|-------|------|------|
| Lines | Line (dual axis) | linesShipped (green), linesRemoved (red) |
| AI % | Line | aiPercent (blue), 0-100% scale |
| Cost | Bar | costCents as dollars (orange) |

**Flow:**
1. Tab loads → fetch daily endpoint (no user param)
2. Populate dropdown with users list
3. Render 3 charts with team data
4. Dropdown change → re-fetch with user param
5. Update charts with individual data

## Tech Stack

- Chart.js via CDN
- Express.js endpoint
- Existing PostgreSQL metrics data
