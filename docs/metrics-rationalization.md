# Metrics Rationalization: Core vs Tool-Specific Metrics

## Overview

This document defines how metrics from GitHub, Claude Code, and Cursor Admin API are structured and aggregated. The key principle is: **core metrics come from GitHub or are common across tools, while tool-specific metrics are nested separately**.

## Core Metrics (Top Level)

These metrics are available from multiple sources or come from GitHub as the primary source.

### Primary Source: GitHub

- `prCount` - Total pull requests (from GitHub API)
- `mergedCount` - Merged PRs
- `avgCycleTimeHours` - Average time from open to merge
- `totalComments` - PR comments count
- `byAuthor` - PR metrics per author

### Common Across Tools

- `linesAdded` - Lines of code added (combined from Claude + Cursor)
- `linesRemoved` - Lines of code removed (combined from Claude + Cursor)
- `costCents` - Total cost in cents USD (combined from Claude + Cursor)
- `commits` - Total commits (GitHub primary, Claude/Cursor secondary)

**Note:** DAU comes from a separate source (not Cursor Admin API)

## GitHub Metrics (Primary Source)

**From GitHub API:**
- `prCount` - Pull request count
- `mergedCount` - Merged PR count
- `avgCycleTimeHours` - Average cycle time
- `totalComments` - Total comments
- `byAuthor` - PR metrics per author

GitHub is the **primary source** for PR metrics. Any PR metrics from Claude or Cursor are considered **secondary** (for AI attribution analysis only).

## Claude Code Metrics (Tool-Specific)

### Core Tool Metrics

- `sessions` - CLI session count (Claude-specific)
- `tokensInput` - Input tokens
- `tokensOutput` - Output tokens
- `tokensCacheRead` - Cache read tokens
- `tokensCacheCreation` - Cache creation tokens
- `costCents` - Cost in cents USD

### Tool Actions (Claude-specific)

- `editAccepted` - Edit tool acceptances
- `editRejected` - Edit tool rejections
- `writeAccepted` - Write tool acceptances
- `writeRejected` - Write tool rejections
- `notebookEditAccepted/Rejected` - Notebook edit actions

### Secondary Metrics (AI Attribution)

- `commitsByClaude` - Commits created with Claude Code (secondary to GitHub)
- `prsByClaude` - PRs created with Claude Code (secondary to GitHub)

These are useful for understanding AI tool impact but are **not primary productivity metrics**.

### Model Breakdown

- `modelBreakdown` - Per-model token/cost data
  - `model` - Model name (claude-sonnet-4, etc.)
  - `tokensInput` - Input tokens per model
  - `tokensOutput` - Output tokens per model
  - `costCents` - Per-model cost

## Cursor Metrics (Tool-Specific)

### Core Tool Metrics

- `costCents` - Cost in cents USD (if available from Admin API)

### AI Feature Breakdown (Cursor-specific)

- `tabLines` - Lines from tab completions
- `composerLines` - Lines from Composer
- `nonAiLines` - Non-AI lines
- `aiPercent` - Percentage of code from AI
- `tabAccepted` - Tab completion acceptances
- `tabRejected` - Tab completion rejections
- `composerAccepted` - Composer acceptances
- `composerRejected` - Composer rejections
- `agentEdits` - Agent edit metrics
- `aiAcceptanceRate` - Overall AI acceptance rate

### Secondary Metrics (AI Attribution)

- `commitsByCursor` - Commits with AI attribution (secondary to GitHub)
- `tabLinesAdded` - Tab lines per commit
- `composerLinesAdded` - Composer lines per commit

**Note:** DAU/WAU/MAU come from separate source, not Cursor Admin API

## Metrics Structure Rationale

### Core Metrics (Top Level)
- Common metrics available from multiple sources (linesAdded, linesRemoved, costCents)
- GitHub primary metrics (PR count, cycle time)
- Aggregated across tools for unified view

### Tool-Specific Metrics (Nested)
- Claude-specific: sessions, tokens, model breakdown, Claude-created PRs/commits (secondary)
- Cursor-specific: tab/composer breakdown, AI attribution, Cursor-created commits (secondary)
- GitHub-specific: PR details, cycle time, comments

### Secondary Metrics
- AI attribution metrics (commitsByClaude, commitsByCursor, prsByClaude) are secondary to GitHub primary metrics
- Useful for understanding AI tool impact but not primary productivity metrics

## Proposed Unified Schema

```json
{
  "source": "github" | "claude" | "cursor",
  "metric_type": "daily",
  "date": "2025-01-01",
  "data": {
    // Core metrics (common or GitHub primary)
    "linesAdded": 1000,        // Combined from Claude + Cursor
    "linesRemoved": 200,       // Combined from Claude + Cursor
    "costCents": 1500,         // Combined from Claude + Cursor
    "commits": 5,              // GitHub primary, Claude/Cursor secondary
    
    // GitHub-specific (primary PR metrics)
    "prCount": 10,
    "mergedCount": 8,
    "avgCycleTimeHours": 12.5,
    "totalComments": 45,
    "byAuthor": {
      "dev1": {
        "prCount": 5,
        "mergedCount": 4,
        "totalCycleTime": 50
      }
    },
    
    // Tool-specific metrics (nested by tool)
    "claude": {
      "sessions": 10,
      "tokensInput": 50000,
      "tokensOutput": 25000,
      "tokensCacheRead": 5000,
      "tokensCacheCreation": 2000,
      "editAccepted": 100,
      "editRejected": 25,
      "writeAccepted": 50,
      "writeRejected": 10,
      "commitsByClaude": 3,      // Secondary metric
      "prsByClaude": 2,          // Secondary metric
      "modelBreakdown": [
        {
          "model": "claude-sonnet-4",
          "tokensInput": 30000,
          "tokensOutput": 15000,
          "costCents": 900
        }
      ]
    },
    
    "cursor": {
      "tabLines": 500,
      "composerLines": 300,
      "nonAiLines": 200,
      "aiPercent": 80.0,
      "tabAccepted": 400,
      "tabRejected": 100,
      "composerAccepted": 250,
      "composerRejected": 50,
      "agentEdits": 25,
      "aiAcceptanceRate": 0.75,
      "commitsByCursor": 2,      // Secondary metric
      "costCents": 600           // If available from Admin API
    },
    
    // User breakdown (if available)
    "byUser": {
      "user@example.com": {
        "linesAdded": 200,
        "costCents": 300,
        "claude": {
          "sessions": 2,
          "tokensInput": 10000
        },
        "cursor": {
          "tabLines": 50,
          "composerLines": 30
        }
      }
    }
  }
}
```

## Dashboard Aggregation Strategy

### Core Metrics (Combined)

- `totalLinesAdded` = Claude linesAdded + Cursor linesAdded
- `totalCost` = Claude costCents + Cursor costCents
- `totalCommits` = GitHub commits (primary) + Claude commitsByClaude + Cursor commitsByCursor (secondary)

### Primary Metrics (GitHub)

- PR count, cycle time, comments (from GitHub only)

### Tool-Specific Views

- **Claude**: Sessions, tokens, model breakdown, Claude-created PRs/commits (secondary)
- **Cursor**: Tab/composer breakdown, AI attribution, Cursor-created commits (secondary)

### Cross-Platform Insights

- Compare AI acceptance rates (Claude edit/write vs Cursor tab/composer)
- Track users who use both tools
- Cost comparison (Claude vs Cursor)
- Secondary metrics: % of PRs/commits created with AI tools

## Implementation Recommendations

1. **Core Metrics at Top Level**: Store `linesAdded`, `linesRemoved`, `costCents` at top level for easy aggregation
2. **Tool-Specific Nested**: Store Claude/Cursor-specific metrics in nested `claude`/`cursor` objects
3. **GitHub Primary**: PR metrics come from GitHub, Claude/Cursor PR metrics are secondary
4. **DAU Separate**: DAU comes from separate source, not stored in tool-specific metrics
5. **Secondary Attribution**: Track `commitsByClaude`/`commitsByCursor` as secondary metrics for AI attribution analysis
6. **Cost Normalization**: All costs in cents USD for easy comparison

## Key Decisions

1. **PRs from GitHub**: GitHub is the primary source for PR metrics. Claude/Cursor PR metrics (`prsByClaude`, `prsByCursor`) are secondary and used only for AI attribution analysis.

2. **DAU Separate**: Daily Active Users come from a separate source (not Cursor Admin API), so they are not included in the tool-specific metrics structure.

3. **Single-Source Metrics**: Metrics that only exist in one tool (e.g., Claude sessions, Cursor tab/composer breakdown) are nested under tool-specific objects rather than at the top level.

4. **Core Metrics Aggregation**: Common metrics like `linesAdded`, `linesRemoved`, and `costCents` are stored at the top level and aggregated across tools for unified dashboard views.

