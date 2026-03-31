# EA Priority Inbox — Design Document

**Date:** 2026-03-30
**Status:** Approved (via chat exploration)
**Repo:** https://github.com/samhinkie/velo
**Branch:** `feature/ea-priority-inbox`

---

## Problem

Sam's EA triages email in Superhuman, applying priority labels (1-High through 4-Archive) and drafting replies. Sam needs an email client that:

1. Sorts inbox by EA's labels, not chronological order
2. Shows EA's draft replies for review/edit/send
3. Auto-advances to next email after send/archive (single-focus flow)

## Solution

Fork Velo (Tauri + React email client) and modify:

1. **Custom sort query** — Drafts (7 days) → 1-High → 2-Medium → 3-Low → 4-Archive → Other
2. **Auto-advance** — After archive/send, select next thread instead of returning to list

## Why Velo

- Lightweight (Tauri/Rust, ~15MB binary)
- Apache 2.0 license
- Mature codebase (236 commits, 1,765 tests)
- Sorting is SQL-level (clean hook point)
- Full Gmail API integration including drafts

---

## Sort Order Specification

**Priority buckets (ascending):**

| Bucket | Condition | Label ID |
|--------|-----------|----------|
| 0 | Has DRAFT label AND last_message_at > 7 days ago | `DRAFT` |
| 1 | Has 1-High label | `Label_8991603863627201242` |
| 2 | Has 2-Medium label | `Label_8180608479175321517` |
| 3 | Has 3-Low label | `Label_8508363860079466600` |
| 4 | Has 4-Archive label | `Label_4139896242361942875` |
| 99 | Everything else | — |

**Within each bucket:** Sort by `last_message_at DESC` (most recent first)

**Pinned threads:** Always float to top (`is_pinned DESC` first)

---

## Auto-Advance Specification

**Trigger events:**
- Archive (keyboard `e` or button)
- Delete/Trash (keyboard `#` or button)
- Send (from composer)
- Spam (keyboard `!`)

**Behavior:**
1. Before removing current thread, find next thread in list (index + 1)
2. If no next, try previous (index - 1)
3. Remove current thread from store
4. Select the next/previous thread
5. Reading pane stays open with new thread

**Edge case:** If inbox becomes empty, show empty state (no crash).

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/db/threads.ts` | Add `getThreadsEAPriority()` function |
| `src/components/layout/EmailList.tsx` | Call new sort function for inbox view |
| `src/hooks/useKeyboardShortcuts.ts` | Add auto-advance logic to archive/delete/spam |
| `src/components/composer/Composer.tsx` | Add auto-advance after send |
| `src/constants/eaLabels.ts` | New file with label ID constants |

---

## Non-Goals (YAGNI)

- Settings UI for label IDs (hardcode for now)
- AI features
- IMAP support (Gmail only)
- Sync with Unified Inbox project (separate concern)

---

## Success Criteria

1. Open Velo → Inbox sorted by EA labels
2. Open thread → Archive → Next thread opens automatically
3. Open thread → Reply → Send → Next thread opens automatically
4. EA's Superhuman drafts visible in thread view

---

## Reference: Prior Work

- Unified Inbox v1.1: `~/.openclaw/workspace/projects/unified-inbox/`
- Gmail label IDs confirmed working in that project
