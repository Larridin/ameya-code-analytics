# Code Analytics Dashboard

Unified dashboard for developer productivity metrics across GitHub, Cursor, and Claude Code.

## Features

- **GitHub Metrics**: Commits, PRs, issues, and review activity
- **Cursor Analytics**: AI coding assistant usage and completions
- **Claude Code Tracking**: Conversations and token usage
- **Trend Visualization**: Charts showing daily AI metrics over time
- **Date Range Filtering**: Flexible time period selection
- **Backfill Support**: Fetch historical data from all sources

## Setup

1. Create database:
   ```bash
   createdb code_analytics
   psql -d code_analytics -f schema.sql
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Install and run:
   ```bash
   npm install
   npm start
   ```

4. Open http://localhost:3000

## Usage

1. Use the Backfill section to fetch data from each source
2. Dashboard auto-refreshes after backfill
3. Change date range and click Refresh to update view

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/metrics` - Get stored metrics
- `POST /api/backfill` - Fetch and store data from external APIs
- `GET /api/dashboard/summary` - Combined metrics summary

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `GITHUB_TOKEN` - GitHub personal access token
- `GITHUB_REPOS` - Comma-separated list of owner/repo
- `CURSOR_API_KEY` - Cursor team API key (enterprise)
- `CLAUDE_ADMIN_KEY` - Anthropic Admin API key

## Tests

```bash
npm test
```
