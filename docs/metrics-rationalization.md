# Metrics Rationalization: Core vs Tool-Specific Metrics

## Overview

This document defines how metrics from GitHub, Claude Code, and Cursor Admin API are structured and aggregated. The key principle is: **core metrics come from GitHub or are common across tools, while tool-specific metrics are nested separately**.

## Core Metrics (Top Level)

These metrics are available from multiple sources or come from GitHub as the primary source.

### Primary Source: GitHub (Committed Code Metrics)

- `prCount` - Total pull requests (from GitHub API)
- `mergedCount` - Merged PRs
- `avgCycleTimeHours` - Average time from open to merge
- `totalComments` - PR comments count
- `linesAdded` - **Total lines added in PRs** (from GitHub PR diff stats - actual committed code)
- `linesRemoved` - **Total lines removed in PRs** (from GitHub PR diff stats)
- `aiLinesAdded` - **Estimated AI-generated lines in committed code** (core metric - see calculation below)
- `aiPercent` - **Percentage of committed code from AI** (core metric - see calculation below)
- `byAuthor` - PR metrics per author

### Tool Usage Metrics (Separate from Committed Code)

- `toolUsageLinesAdded` - **Total lines written in tools** (Claude + Cursor, committed + uncommitted)
- `toolUsageAiLinesAdded` - **AI lines written in tools** (Claude + Cursor, committed + uncommitted)
- `toolUsageAiPercent` - **AI percent in tool usage** (separate metric - see calculation below)

### Common Across Tools

- `costCents` - Total cost in cents USD (combined from Claude + Cursor)
- `commits` - Total commits (GitHub primary, Claude/Cursor secondary)

**Note:** DAU comes from a separate source (not Cursor Admin API)

## GitHub Metrics (Primary Source)

**From GitHub API:**
- `prCount` - Pull request count
- `mergedCount` - Merged PR count
- `avgCycleTimeHours` - Average cycle time
- `totalComments` - Total comments
- `linesAdded` - **Lines added in PRs** (from PR diff stats - actual committed code)
- `linesRemoved` - **Lines removed in PRs** (from PR diff stats)
- `byAuthor` - PR metrics per author

**Note:** To get `linesAdded`/`linesRemoved` from GitHub, we need to fetch PR diff stats (e.g., `GET /repos/{owner}/{repo}/pulls/{pull_number}` includes `additions` and `deletions` fields).

GitHub is the **primary source** for PR metrics and actual code metrics. Any PR metrics from Claude or Cursor are considered **secondary** (for AI attribution analysis only).

## Claude Code Metrics (Tool-Specific)

### Core Tool Metrics

- `sessions` - CLI session count (Claude-specific)
- `linesAdded` - Lines of code added in Claude sessions (assumed to be AI-assisted)
- `tokensInput` - Input tokens
- `tokensOutput` - Output tokens
- `tokensCacheRead` - Cache read tokens
- `tokensCacheCreation` - Cache creation tokens
- `costCents` - Cost in cents USD

**Note:** Claude Code doesn't provide explicit AI vs non-AI breakdown. Since all code in Claude sessions is AI-assisted, we treat `linesAdded` as AI lines.

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

- `totalLinesAdded` - Total lines of code added (AI + non-AI)
- `acceptedLinesAdded` - **AI-generated lines that were accepted** (used for combined AI calculation)
- `costCents` - Cost in cents USD (if available from Admin API)

### AI Feature Breakdown (Cursor-specific)

- `tabLines` - Lines from tab completions (if available from commits API)
- `composerLines` - Lines from Composer (if available from commits API)
- `nonAiLines` - Non-AI lines (calculated as `totalLinesAdded - acceptedLinesAdded`)
- `aiPercent` - Percentage of code from AI (Cursor-specific, calculated as `acceptedLinesAdded / totalLinesAdded * 100`)
- `totalTabsShown` - Tab completions shown
- `totalTabsAccepted` - Tab completions accepted
- `composerRequests` - Composer requests
- `chatRequests` - Chat requests
- `agentRequests` - Agent requests
- `tabAcceptRate` - Tab acceptance rate

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
    // Core metrics - Committed Code (from GitHub)
    "linesAdded": 2000,        // From GitHub PR diff stats (actual committed code)
    "linesRemoved": 500,       // From GitHub PR diff stats
    "aiLinesAdded": 1400,      // Estimated: GitHub.linesAdded * aiPrPercent
    "aiPercent": 70.0,         // Calculated: (aiLinesAdded / linesAdded) * 100
    
    // Tool Usage Metrics (separate from committed code)
    "toolUsageLinesAdded": 3500,      // Claude.linesAdded + Cursor.totalLinesAdded
    "toolUsageAiLinesAdded": 2900,    // Claude.linesAdded + Cursor.acceptedLinesAdded
    "toolUsageAiPercent": 82.9,       // (toolUsageAiLinesAdded / toolUsageLinesAdded) * 100
    
    // Other core metrics
    "costCents": 1500,         // Combined from Claude + Cursor
    "commits": 5,              // GitHub primary, Claude/Cursor secondary
    
    // GitHub-specific (primary PR metrics)
    "prCount": 10,
    "mergedCount": 8,
    "avgCycleTimeHours": 12.5,
    "totalComments": 45,
    // Note: linesAdded/linesRemoved are at top level (core metrics)
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
      "linesAdded": 500,         // All lines from Claude (assumed AI)
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
      "totalLinesAdded": 1000,   // Total lines (AI + non-AI)
      "acceptedLinesAdded": 700, // AI lines accepted (used for combined calculation)
      "nonAiLines": 300,         // Calculated: totalLinesAdded - acceptedLinesAdded
      "aiPercent": 70.0,         // Cursor-specific: (acceptedLinesAdded / totalLinesAdded) * 100
      "totalTabsShown": 500,
      "totalTabsAccepted": 400,
      "composerRequests": 50,
      "chatRequests": 30,
      "agentRequests": 20,
      "tabAcceptRate": 80.0,     // (totalTabsAccepted / totalTabsShown) * 100
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

## Combined AI Metrics Calculation

This section explains how to compute AI metrics for **two separate contexts**:
1. **Committed Code** (from GitHub PRs) - what actually made it into the codebase
2. **Tool Usage** (from Claude/Cursor) - what was written in tools (committed + uncommitted)

### Why Two Separate Metrics?

**Problem:** If we mix tool usage with committed code:
- Tool usage: 2000 AI lines written
- GitHub PRs: 1000 lines committed
- Mixing these could give `aiPercent > 100%` (nonsensical)

**Solution:** Keep them separate:
- **Committed code metrics** use GitHub PR diff stats as denominator
- **Tool usage metrics** use tool session data as denominator
- Each has its own AI percent calculation

### Data Sources

**From GitHub (Primary - Actual Committed Code):**
- `linesAdded` - Total lines added in PRs (from PR diff stats)
- `prCount` - Total PRs
- `mergedCount` - Merged PRs

**From Claude Code (Secondary - AI Attribution):**
- `commitsByClaude` - Commits created with Claude Code
- `prsByClaude` - PRs created with Claude Code
- `linesAdded` (tool usage) - Lines in Claude sessions (not necessarily committed)

**From Cursor (Secondary - AI Attribution):**
- `commitsByCursor` - Commits with AI attribution
- `acceptedLinesAdded` (tool usage) - AI lines accepted in Cursor (not necessarily committed)

### Committed Code Metrics (Core - From GitHub PRs)

#### 1. Total Lines Added (Committed)

**Formula:**
```
linesAdded = GitHub.linesAdded (from PR diff stats)
```

**Explanation:**
- This is the **actual committed code** that matters
- Comes from GitHub PR diff stats (`additions` field)
- Represents real code that made it into the codebase

#### 2. AI Lines Added (Committed - Estimated)

**Option A: Estimate from Secondary Metrics (Recommended)**

**Formula:**
```
// Estimate based on % of PRs/commits created with AI tools
aiPrPercent = (Claude.prsByClaude + Cursor.commitsByCursor) / GitHub.prCount
aiLinesAdded = GitHub.linesAdded * aiPrPercent
```

**Explanation:**
- If X% of PRs/commits were created with AI tools, estimate X% of lines are AI-generated
- This is an approximation but uses actual commit/PR attribution
- **Cannot exceed 100%** because it's based on PR attribution

**Option B: Use Tool Usage as Proxy (Less Accurate, Can Exceed 100%)**

**Formula:**
```
// Use tool usage metrics as proxy (acknowledge it's an estimate)
toolUsageAiPercent = (Claude.linesAdded + Cursor.acceptedLinesAdded) / 
                     (Claude.linesAdded + Cursor.totalLinesAdded)
aiLinesAdded = GitHub.linesAdded * toolUsageAiPercent
```

**Warning:** This can exceed `linesAdded` if tool usage > committed code. Not recommended.

#### 3. AI Percent (Committed Code)

**Formula:**
```
aiPercent = (aiLinesAdded / linesAdded) * 100
```

**Explanation:**
- Shows what percentage of **committed code** was AI-generated
- Uses actual PR lines as denominator
- **Cannot exceed 100%** when using Option A (PR attribution)

### Tool Usage Metrics (Separate - Not Core)

#### 1. Total Lines Added (Tool Usage)

**Formula:**
```
toolUsageLinesAdded = Claude.linesAdded + Cursor.totalLinesAdded
```

**Explanation:**
- Total lines written in tools (committed + uncommitted)
- Includes code that may not have been committed

#### 2. AI Lines Added (Tool Usage)

**Formula:**
```
toolUsageAiLinesAdded = Claude.linesAdded + Cursor.acceptedLinesAdded
```

**Explanation:**
- AI-generated lines written in tools
- Claude lines are all AI (by definition)
- Cursor `acceptedLinesAdded` represents AI-generated code accepted

#### 3. AI Percent (Tool Usage)

**Formula:**
```
toolUsageAiPercent = (toolUsageAiLinesAdded / toolUsageLinesAdded) * 100
```

**Explanation:**
- Shows AI adoption rate in tool usage
- Separate from committed code metrics
- Can be different from committed code AI percent

### Calculation Examples

#### Example 1: Committed Code Metrics

**Input Data:**
- GitHub: `linesAdded = 2000` (from PR diff stats), `prCount = 20`
- Claude: `prsByClaude = 8`, `commitsByClaude = 12`
- Cursor: `commitsByCursor = 6`

**Calculations:**
```
// Estimate AI contribution to PRs/commits
aiPrPercent = (8 + 6) / 20 = 0.70 = 70%

// Estimate AI lines in committed code
aiLinesAdded = 2000 * 0.70 = 1400

// Calculate AI percent (committed code)
aiPercent = (1400 / 2000) * 100 = 70.0%
```

**Result:**
- 70% of committed code (1400 out of 2000 lines) estimated to be AI-generated
- Based on 70% of PRs/commits being created with AI tools
- **Cannot exceed 100%** because it's based on PR attribution

#### Example 2: Tool Usage Metrics

**Input Data:**
- Claude: `linesAdded = 1500` (all AI)
- Cursor: `totalLinesAdded = 2000`, `acceptedLinesAdded = 1400`

**Calculations:**
```
toolUsageLinesAdded = 1500 + 2000 = 3500
toolUsageAiLinesAdded = 1500 + 1400 = 2900
toolUsageAiPercent = (2900 / 3500) * 100 = 82.9%
```

**Result:**
- 82.9% of tool usage was AI-generated
- 3500 lines written in tools (may include uncommitted code)
- Separate from committed code metrics

#### Example 3: Why Separation Matters

**Scenario:**
- Tool usage: 5000 lines written (4000 AI)
- GitHub PRs: 2000 lines committed

**If we mixed them (WRONG):**
```
aiPercent = 4000 / 2000 = 200% ❌ (nonsensical)
```

**With separation (CORRECT):**
```
// Committed code
aiPercent = (estimated from PR attribution) ≤ 100% ✓

// Tool usage
toolUsageAiPercent = 4000 / 5000 = 80% ✓
```

This shows why we need two separate metrics.

### Edge Cases

1. **No GitHub data**: Cannot calculate core AI metrics (need committed code)
2. **No secondary metrics**: Cannot estimate AI contribution (fall back to tool usage proxy)
3. **No tool usage data**: Can still calculate if we have secondary metrics

### Implementation Notes

- **Primary**: Use GitHub PR diff stats for `totalLinesAdded` (actual committed code)
- **Estimation**: Use secondary metrics (commitsByClaude, prsByClaude, commitsByCursor) to estimate AI contribution
- **Acknowledge**: AI metrics are estimates, not exact measurements
- **Store**: Both tool usage metrics (nested) and estimated committed code metrics (core)
- **Display**: Clearly label AI metrics as "estimated" in dashboard

## Dashboard Aggregation Strategy

### Committed Code Metrics (Core - From GitHub)

- `linesAdded` = **GitHub PR diff stats** (actual committed code)
- `aiLinesAdded` = **Estimated** from secondary metrics (see calculation above)
- `aiPercent` = (aiLinesAdded / linesAdded) * 100
- **Cannot exceed 100%** (based on PR attribution)

### Tool Usage Metrics (Separate - From Claude/Cursor)

- `toolUsageLinesAdded` = Claude linesAdded + Cursor totalLinesAdded
- `toolUsageAiLinesAdded` = Claude linesAdded + Cursor acceptedLinesAdded
- `toolUsageAiPercent` = (toolUsageAiLinesAdded / toolUsageLinesAdded) * 100
- Shows AI adoption in tool usage (committed + uncommitted)

### Other Core Metrics

- `totalCost` = Claude costCents + Cursor costCents
- `totalCommits` = GitHub commits (primary) + Claude commitsByClaude + Cursor commitsByCursor (secondary)

### Display Strategy

**Dashboard should show:**
1. **Committed Code Section**: `linesAdded`, `aiLinesAdded`, `aiPercent` (from GitHub)
2. **Tool Usage Section**: `toolUsageLinesAdded`, `toolUsageAiLinesAdded`, `toolUsageAiPercent` (from tools)
3. **Comparison**: Show both side-by-side to understand adoption vs. actual impact

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

5. **AI Metrics Calculation**: 
   - `aiLinesAdded` = Claude `linesAdded` (all AI) + Cursor `acceptedLinesAdded` (AI accepted)
   - `aiPercent` = (aiLinesAdded / totalLinesAdded) * 100
   - These are core metrics showing overall AI adoption across tools

