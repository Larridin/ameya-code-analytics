# Developer Analytics Dashboard - Design

## Overview

A unified dashboard to track developer productivity, AI tool adoption, and costs across GitHub, Cursor, and Claude Code.

## Goals

- Understand developer productivity
- Measure AI impact (% of code from AI tools)
- Track costs across AI tools
- Support multiple audiences: developers, managers, executives

## Tech Stack

- **Backend:** Node.js (Express)
- **Frontend:** Vanilla HTML/JS + Chart.js
- **Database:** PostgreSQL (local)
- **No build step, minimal files**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Vanilla HTML/JS + Chart.js                         │    │
│  │  - Dashboard views (team, individual, executive)    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express API Server                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ /api/github  │  │ /api/cursor  │  │ /api/claude  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                              │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  POST /api/backfill - Explicit data ingestion       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                               │
│  - Source of truth for all metrics                          │
│  - No TTL/cache expiry                                      │
│  - Backfill adds/updates records                            │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Backfill:** `POST /api/backfill { source, startDate, endDate }` fetches from external APIs and stores in Postgres
2. **Dashboard:** Reads only from Postgres, never hits external APIs directly

## Data Sources

### GitHub API
- PR cycle time (open to merge)
- Commits per author
- PR count, comments per PR

### Cursor Analytics API
- Base URL: `https://api.cursor.com`
- Auth: Basic Auth with API key
- Endpoints:
  - `/analytics/team/agent-edits` - AI edit suggestions/accepts
  - `/analytics/team/tabs` - Tab completion metrics
  - `/analytics/team/dau` - Daily active users
  - `/analytics/ai-code/commits` - Commit-level AI attribution (TAB vs COMPOSER vs non-AI)

### Claude Code Admin API
- Base URL: `https://api.anthropic.com`
- Auth: Admin API key (`sk-ant-admin...`) via `x-api-key` header
- Endpoint: `/v1/organizations/usage_report/claude_code?starting_at=YYYY-MM-DD`
- Returns per-user per-day:
  - `core_metrics`: sessions, lines added/removed, commits, PRs
  - `tool_actions`: edit/write/notebook_edit accepted/rejected
  - `model_breakdown`: tokens, estimated_cost (in cents USD)

## Database Schema

```sql
-- API credentials and settings
CREATE TABLE config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Metrics from all sources
CREATE TABLE metrics (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,       -- 'github', 'cursor', 'claude'
    metric_type VARCHAR(100) NOT NULL, -- 'pr_cycle_time', 'ai_attribution', etc.
    date DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(source, metric_type, date)
);

CREATE INDEX idx_metrics_lookup
ON metrics(source, metric_type, date);
```

## API Endpoints

```
GET  /api/config                     # Get settings
POST /api/config                     # Save API keys

POST /api/backfill                   # Fetch and store data
     { source: "github|cursor|claude", startDate, endDate }

GET  /api/metrics                    # Read from Postgres
     ?source=...&startDate=...&endDate=...

GET  /api/dashboard/summary          # Combined metrics for dashboard
```

## File Structure

```
code-analytics/
├── server.js              # Express app, routes
├── lib/
│   ├── github.js          # GitHub API client
│   ├── cursor.js          # Cursor API client
│   ├── claude.js          # Claude Code Admin API client
│   └── db.js              # Postgres connection + queries
├── public/
│   ├── index.html         # Dashboard UI
│   ├── app.js             # Frontend JS
│   └── style.css          # Minimal styling
├── schema.sql             # Database schema
├── package.json
├── .env.example
└── README.md
```

## Frontend Views

### Team Overview (MVP)
- Summary cards: sessions, lines of code, PRs, costs
- AI adoption rate: % code from AI tools
- Trend charts: daily activity
- Date range picker, refresh button

### Individual View (v2)
- Filter by user
- Personal metrics vs team average

### Executive View (v2)
- Cost analysis by tool/month
- ROI indicators
- Adoption trends

## MVP Scope

| Source | Metric | Purpose |
|--------|--------|---------|
| GitHub | PR cycle time | Core productivity |
| Cursor | AI code attribution (% TAB/COMPOSER) | AI adoption |
| Claude Code | Sessions + cost | Usage + costs |

**MVP deliverables:**
1. Express server with 3 API clients
2. Postgres schema + db.js
3. Backfill endpoint + simple UI
4. Single dashboard showing 3 key metrics
5. Date range picker
6. Config page for API keys

**Deferred to v2:**
- Per-user filtering
- Executive/individual views
- Detailed breakdowns (acceptance rates, model usage)
- CSV export

## Notes

- Cursor APIs are enterprise-only
- Claude Code Admin API requires org admin role
- GitHub needs token with repo read access
- All dates in UTC
