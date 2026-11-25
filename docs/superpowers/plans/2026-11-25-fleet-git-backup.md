# Fleet Network Config Git Versioning & Auto-Backup Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized Fleet-Wide Network Configuration Versioning & Auto-Backup Hub (`src/components/FleetGitBackupModal.jsx`, `server/gitBackupService.js`) in SwitchBook. Provides fleet-wide configuration status, 1-click batch collection & Git commit, chronological commit audit log with visual diff inspection, remote push to GitLab/GitHub/Gitea, and 1-click download of a full network archive (.zip).

**Architecture:**
- **Backend (`server/gitBackupService.js` & `server/index.js`):** Enhances Git backup service with `getFleetCommitLog()`, `getCommitDiff()`, `getFleetStatus()`, and ZIP archive generation. Exposes REST endpoints (`/api/backups/git/fleet-status`, `/api/backups/git/commits`, `/api/backups/git/diff/:hash`, `/api/backups/git/download-archive`).
- **Frontend Hub (`src/components/FleetGitBackupModal.jsx`):** Interactive modal with 4 tabs: Fleet Switches Status, Git Commits Audit Feed, Interactive Diff Viewer, and Remote Sync & ZIP Export.
- **Integration:** Wired into `Header.jsx` (Tools dropdown), `DashboardView.jsx` (Quick actions), and `CommandPalette.jsx` (`Ctrl+K`).

---

### Task 1: Backend Git Backup Service Expansion & REST API

**Files:**
- Modify: `server/gitBackupService.js`
- Modify: `server/index.js`
- Test: `test/fleetGitBackup.test.js`

**Interfaces:**
- Functions in `gitBackupService`:
  - `getFleetCommitLog(limit = 50) -> Promise<{ commits: Array<{ hash, shortHash, author, date, message, files }> }>`
  - `getCommitDiff(commitHash) -> Promise<{ hash, diff: string, files: string[] }>`
  - `getFleetStatus() -> Promise<{ repoPath, commitsCount, remoteUrl, switches: Array<{ id, name, ip, vendor, hasBackup, lastBackupDate, gitFile, isCommitted }> }>`
  - `createFleetZipArchive() -> Promise<Buffer>`
- REST Endpoints in `server/index.js`:
  - `GET /api/backups/git/fleet-status`
  - `GET /api/backups/git/commits`
  - `GET /api/backups/git/diff/:hash`
  - `POST /api/backups/git/batch-commit`
  - `GET /api/backups/git/download-archive`

---

### Task 2: Unit & Integration Tests

**Files:**
- Create: `test/fleetGitBackup.test.js`
- Verify git repo initialization, status extraction, commit diff, and ZIP generation.

---

### Task 3: Frontend API Client & Fleet Git Backup Modal

**Files:**
- Modify: `src/api.js`
- Create: `src/components/FleetGitBackupModal.jsx`

---

### Task 4: UI Integration (Header, Dashboard, CommandPalette, App)

**Files:**
- Modify: `src/components/Header.jsx`
- Modify: `src/components/DashboardView.jsx`
- Modify: `src/components/CommandPalette.jsx`
- Modify: `src/App.jsx`

---

### Task 5: Verification & Browser QA

- Run all unit tests (`node --test test/*.test.js`).
- Build verification (`npm run build`).
- Browser QA subagent test: Open modal, check tabs, inspect diff and commit list.
- Commit to `master` and push to remote.
