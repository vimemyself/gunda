# Opportunity Dashboard

A simple sales pipeline and action item tracker. Hosted on GitHub Pages, fully editable from the dashboard itself, with Claude chat as a backup for bulk changes or descriptions you'd rather just dictate.

## Live URL

After setup, your dashboard will live at:

```
https://YOUR-USERNAME.github.io/opportunity-dashboard/
```

## What you can do directly in the dashboard

| Action | How |
|---|---|
| **Add an opportunity** | Click "New opportunity" → fill in the form → "Add opportunity" |
| **Edit an opportunity** | Click the opportunity name (or the "Edit" link) → form opens with current values |
| **Delete an opportunity** | Hover the card → click the trash icon top-right → confirm |
| **Add an action** | Click "Add action" inside an opportunity, OR "New action" in the action items view |
| **Edit an action** | Click the action text → form opens |
| **Delete an action** | Hover the action → click the × → confirm |
| **Mark action done** | Click the checkbox |
| **Re-link an action** | Edit the action → change "Linked to opportunity" dropdown |

Every change shows an **unsaved changes banner** at the top. When you're ready to persist your edits to GitHub, click "Copy updated data.json" (auto-copies to clipboard) → click "Open on GitHub" (opens the right page) → paste → commit. Done.

## Initial setup

### 1. Create the GitHub repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **+** icon in the top right → **New repository**
3. Repository name: `opportunity-dashboard`
4. Set it to **Public** (required for free GitHub Pages)
5. Check **Add a README file**
6. Click **Create repository**

### 2. Upload the files

1. In your new repo, click **Add file** → **Upload files**
2. Drag in: `index.html`, `style.css`, `app.js`, `data.json`
3. Scroll down, click **Commit changes**

### 3. Turn on GitHub Pages

1. In your repo, click **Settings** (top right of the repo page)
2. In the left sidebar, click **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Branch: **main**, Folder: **/ (root)** → click **Save**
5. Wait about 60 seconds, then refresh — the URL appears at the top of the Pages settings

### 4. Visit your dashboard

Open the URL. You should see the dashboard with three sample opportunities. Try adding, editing, and deleting things — they'll all work locally with the unsaved-changes banner showing your edits.

## How saving works (important!)

The dashboard is a static site, so it can't write directly to your GitHub repo. Edits live in your browser until you commit them back. Here's the rhythm:

1. Make as many edits as you want — the "unsaved changes" banner counts them
2. When ready, click **"Copy updated data.json"** (the JSON of your edited state is now in your clipboard)
3. Click **"Open on GitHub"** (auto-opens `data.json` for editing in your repo)
4. On the GitHub page: select all (Ctrl/Cmd+A), paste, scroll down, **Commit changes**
5. ~30 seconds later your live site reflects the new state

You can batch many changes before saving. The browser will warn you if you try to close the tab with unsaved edits.

## Updating through Claude chat (optional)

Sometimes it's easier to describe what you want than to fill out forms. For those cases:

1. Tell Claude in plain English. Examples:
   - *"Add an opportunity for Initech: AI chatbot pilot, $90k, received yesterday, closes May 15. Replacing legacy chatbot, decision by Q2 board meeting."*
   - *"Add three follow-up actions to the Northwind opportunity: send revised proposal Feb 15, schedule demo Feb 22, draft contract Mar 1."*
   - *"Mark all actions on the Acme opportunity as done."*
2. Claude returns the complete updated `data.json`.
3. Same flow as before: paste into `data.json` on GitHub → commit.

## Data structure (for reference)

Every opportunity:

| Field | Type |
|---|---|
| `id` | string (unique, e.g. `opp-abc123`) |
| `clientName` | string |
| `opportunityName` | string |
| `description` | string |
| `size` | number (USD, no formatting) |
| `receivedDate` | string `YYYY-MM-DD` |
| `etaCloseDate` | string `YYYY-MM-DD` |
| `keyAspects` | string |
| `colorIndex` | number 1–8 (auto-assigned) |
| `actions` | array |

Every action:

| Field | Type |
|---|---|
| `id` | string |
| `text` | string |
| `dueDate` | string `YYYY-MM-DD` (optional) |
| `done` | boolean |

Standalone actions (not linked to an opportunity) live in the top-level `standaloneActions` array.

## Tips & notes

- **The dashboard never writes to GitHub on its own.** All persistence is your manual paste-and-commit step. This is by design — keeps it simple and free.
- **JSON validity matters.** If the dashboard goes blank, your `data.json` likely has a syntax error. Paste it into [jsonlint.com](https://jsonlint.com) to find it.
- **Backups:** click "Download backup" in the footer to save a copy of your current state.
- **Discard mistakes:** the "Discard" button in the unsaved-changes banner reverts to the saved version.

## Privacy

This is a public GitHub Pages site. The URL is unlisted but anyone who finds it can see all the data. For sensitive client information, consider using initials or codenames (e.g., "A.L." instead of the real client name).
