# Identity Mappings Feature Design

## Overview

Add a new tab to map email addresses to GitHub usernames, enabling unified user data across GitHub (username-based), Cursor (email-based), and Claude Code (email-based) metrics.

## Data Model

### New Table: `identity_mappings`

| Column | Type | Description |
|--------|------|-------------|
| `email` | VARCHAR | Primary key, the canonical identifier |
| `github_username` | VARCHAR | GitHub login (unique, not null) |
| `created_at` | TIMESTAMP | When mapping was created |
| `updated_at` | TIMESTAMP | Last modification |

**Constraints:**
- `email` is primary key
- `github_username` has unique constraint (one GitHub user = one email)

### API Endpoints

- `GET /api/identity-mappings` - List all mappings
- `POST /api/identity-mappings` - Create/update a mapping
- `DELETE /api/identity-mappings/:email` - Remove a mapping

## UI Design

### Navigation

Add a tab bar at the top of the page:
- `Dashboard | Identity Mappings`
- Clicking a tab switches the view (no page reload)

### Identity Mappings Tab

```
┌─────────────────────────────────────────────────────┐
│  Add New Mapping                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───┐ │
│  │ Email            │  │ GitHub Username  │  │Add│ │
│  └──────────────────┘  └──────────────────┘  └───┘ │
├─────────────────────────────────────────────────────┤
│  Current Mappings                                   │
│  ┌─────────────────────────────────────────────────┐│
│  │ Email                │ GitHub Username │ Action ││
│  │ alice@company.com    │ alice-dev       │ [x]    ││
│  │ bob@company.com      │ bobsmith        │ [x]    ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Add form validates both fields required
- Table shows all existing mappings with delete button
- Delete + re-add for corrections (no inline editing)

## Dashboard Team View Changes

### Primary Identifier: Email

- All rows identified by email address
- GitHub data looked up via mapping (GitHub username → email)
- Cursor and Claude data already keyed by email

### Unmapped GitHub Users

- Shown at bottom of table with GitHub username as identifier
- Visual indicator: warning icon with "Unmapped - click to add" tooltip
- Clicking opens modal or navigates to Mappings tab with username pre-filled

**Example:**

| User | GitHub PRs | Claude Sessions | Cursor LoC |
|------|------------|-----------------|------------|
| alice@company.com | 5 | 12 | 340 |
| bob@company.com | 3 | 8 | 220 |
| ⚠️ `unknown-dev` | 2 | - | - |

## Files to Modify

| File | Change |
|------|--------|
| `schema.sql` | Add `identity_mappings` table |
| `lib/db.js` | Add CRUD functions for mappings |
| `server.js` | Add 3 API endpoints for mappings |
| `public/index.html` | Add tab bar + mappings section HTML |
| `public/app.js` | Add tab switching, mappings CRUD, team view integration |
| `public/style.css` | Tab styling, unmapped user indicator |

## Technical Notes

- No new dependencies required
- Uses existing vanilla JS, Express, PostgreSQL stack
- Mappings cached on dashboard load to avoid repeated DB queries
