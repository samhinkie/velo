# EA Priority Inbox — Implementation Plan

**Goal:** Sort Velo inbox by EA's Superhuman labels and auto-advance after actions.
**Architecture:** SQL-level sort in threads.ts, auto-advance hooks in keyboard shortcuts and composer.
**Tech Stack:** TypeScript, SQLite (via Tauri), React, Zustand

---

## Task 1: Add EA Label Constants

**Files:**
- Create: `src/constants/eaLabels.ts`

**Step 1: Create constants file**
```typescript
// src/constants/eaLabels.ts

/**
 * Gmail label IDs used by EA in Superhuman for priority triage.
 * These are Sam's specific label IDs - update if EA's labels change.
 */
export const EA_LABELS = {
  HIGH: 'Label_8991603863627201242',      // 1-High
  MEDIUM: 'Label_8180608479175321517',    // 2-Medium
  LOW: 'Label_8508363860079466600',       // 3-Low
  ARCHIVE: 'Label_4139896242361942875',   // 4-Archive
} as const;

export const EA_PRIORITY_ORDER = [
  EA_LABELS.HIGH,
  EA_LABELS.MEDIUM,
  EA_LABELS.LOW,
  EA_LABELS.ARCHIVE,
] as const;

/** Days to consider a draft "recent" */
export const RECENT_DRAFT_DAYS = 7;
```

**Step 2: Commit**
```bash
git add src/constants/eaLabels.ts
git commit -m "feat: add EA label constants for priority sorting"
```

---

## Task 2: Add EA Priority Sort Query

**Files:**
- Modify: `src/services/db/threads.ts`

**Step 1: Add import at top of file**
```typescript
import { EA_LABELS, RECENT_DRAFT_DAYS } from "@/constants/eaLabels";
```

**Step 2: Add new function after `getThreadsForCategory`**
```typescript
/**
 * Get threads sorted by EA priority labels:
 * 0. Recent drafts (last 7 days)
 * 1. 1-High
 * 2. 2-Medium  
 * 3. 3-Low
 * 4. 4-Archive
 * 99. Everything else
 * 
 * Within each bucket: most recent first (last_message_at DESC)
 * Pinned threads always float to top.
 */
export async function getThreadsEAPriority(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  
  const recentDraftCutoff = Date.now() - (RECENT_DRAFT_DAYS * 24 * 60 * 60 * 1000);
  
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address
     FROM threads t
     INNER JOIN thread_labels tl_inbox ON tl_inbox.account_id = t.account_id 
       AND tl_inbox.thread_id = t.id 
       AND tl_inbox.label_id = 'INBOX'
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1
     GROUP BY t.account_id, t.id
     ORDER BY 
       t.is_pinned DESC,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_d 
           WHERE tl_d.account_id = t.account_id 
             AND tl_d.thread_id = t.id 
             AND tl_d.label_id = 'DRAFT'
         ) AND t.last_message_at > $2 THEN 0
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_h
           WHERE tl_h.account_id = t.account_id 
             AND tl_h.thread_id = t.id 
             AND tl_h.label_id = $3
         ) THEN 1
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_m
           WHERE tl_m.account_id = t.account_id 
             AND tl_m.thread_id = t.id 
             AND tl_m.label_id = $4
         ) THEN 2
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_l
           WHERE tl_l.account_id = t.account_id 
             AND tl_l.thread_id = t.id 
             AND tl_l.label_id = $5
         ) THEN 3
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_a
           WHERE tl_a.account_id = t.account_id 
             AND tl_a.thread_id = t.id 
             AND tl_a.label_id = $6
         ) THEN 4
         ELSE 99
       END ASC,
       t.last_message_at DESC
     LIMIT $7 OFFSET $8`,
    [
      accountId,
      recentDraftCutoff,
      EA_LABELS.HIGH,
      EA_LABELS.MEDIUM,
      EA_LABELS.LOW,
      EA_LABELS.ARCHIVE,
      limit,
      offset,
    ],
  );
}
```

**Step 3: Export the function**
Ensure it's exported (add to any barrel exports if needed).

**Step 4: Commit**
```bash
git add src/services/db/threads.ts
git commit -m "feat: add getThreadsEAPriority() for EA label sorting"
```

---

## Task 3: Wire EA Sort to Inbox View

**Files:**
- Modify: `src/components/layout/EmailList.tsx` (or wherever threads are loaded)

**Step 1: Find thread loading logic**
Search for `getThreadsForAccount` or `getThreadsForCategory` calls.

**Step 2: Add conditional for inbox view**
```typescript
import { getThreadsEAPriority } from "@/services/db/threads";

// In the thread loading logic, when labelId is 'INBOX' or null (default view):
const threads = labelId === 'INBOX' || !labelId
  ? await getThreadsEAPriority(accountId, limit, offset)
  : await getThreadsForAccount(accountId, labelId, limit, offset);
```

**Step 3: Test manually**
- Run app: `npm run dev`
- Connect Gmail account
- Verify inbox shows EA-labeled emails first

**Step 4: Commit**
```bash
git add src/components/layout/EmailList.tsx
git commit -m "feat: use EA priority sort for inbox view"
```

---

## Task 4: Add Auto-Advance Helper

**Files:**
- Create: `src/utils/threadNavigation.ts`

**Step 1: Create helper function**
```typescript
// src/utils/threadNavigation.ts

import { useThreadStore } from "@/stores/threadStore";

/**
 * Find the next thread to select after removing the current one.
 * Prefers the thread after current, falls back to before.
 */
export function getNextThreadId(currentId: string): string | null {
  const { threads } = useThreadStore.getState();
  const currentIdx = threads.findIndex(t => t.id === currentId);
  
  if (currentIdx === -1) return null;
  
  // Prefer next thread, fall back to previous
  const nextThread = threads[currentIdx + 1] || threads[currentIdx - 1];
  return nextThread?.id ?? null;
}

/**
 * Remove a thread and auto-advance to the next one.
 */
export function removeAndAdvance(threadId: string): void {
  const nextId = getNextThreadId(threadId);
  const store = useThreadStore.getState();
  
  store.removeThread(threadId);
  
  if (nextId) {
    store.selectThread(nextId);
  }
}
```

**Step 2: Commit**
```bash
git add src/utils/threadNavigation.ts
git commit -m "feat: add thread navigation helpers for auto-advance"
```

---

## Task 5: Add Auto-Advance to Archive

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Add import**
```typescript
import { removeAndAdvance } from "@/utils/threadNavigation";
```

**Step 2: Modify archive case (~line 180)**

Find:
```typescript
case "action.archive": {
  // ... existing code
  if (selectedId && activeAccountId) {
    await archiveThread(activeAccountId, selectedId, []);
  }
  break;
}
```

Replace with:
```typescript
case "action.archive": {
  const multiIds = useThreadStore.getState().selectedThreadIds;
  if (multiIds.size > 0 && activeAccountId) {
    // Multi-select: archive all, advance from last
    const ids = [...multiIds];
    for (const id of ids) {
      await archiveThread(activeAccountId, id, []);
      useThreadStore.getState().removeThread(id);
    }
    useThreadStore.getState().clearMultiSelect();
  } else if (selectedId && activeAccountId) {
    // Single select: archive and advance
    await archiveThread(activeAccountId, selectedId, []);
    removeAndAdvance(selectedId);
  }
  break;
}
```

**Step 3: Apply same pattern to delete and spam cases**

**Step 4: Test**
- Press `e` on an email → next email should open
- Press `#` on an email → next email should open

**Step 5: Commit**
```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: auto-advance after archive/delete/spam"
```

---

## Task 6: Add Auto-Advance After Send

**Files:**
- Modify: `src/components/composer/Composer.tsx`

**Step 1: Add import**
```typescript
import { removeAndAdvance } from "@/utils/threadNavigation";
```

**Step 2: Find send success handler**
Look for where `sendEmail()` resolves successfully.

**Step 3: Add auto-advance after successful send**
```typescript
// After successful send, if this was a reply (has threadId), advance
if (state.threadId) {
  removeAndAdvance(state.threadId);
}
```

**Step 4: Test**
- Open email → Reply → Send → Next email should open

**Step 5: Commit**
```bash
git add src/components/composer/Composer.tsx
git commit -m "feat: auto-advance after sending reply"
```

---

## Task 7: Final Integration Test

**Manual test checklist:**
- [ ] Inbox sorted by EA labels (1-High first, then 2-Medium, etc.)
- [ ] Recent drafts (7 days) appear at top
- [ ] Archive (e) → advances to next
- [ ] Delete (#) → advances to next  
- [ ] Send reply → advances to next
- [ ] Empty inbox shows empty state (no crash)
- [ ] Pinned threads float to top regardless of label

**Step 1: Run full test suite**
```bash
npm test
```

**Step 2: Fix any failures**

**Step 3: Final commit**
```bash
git add -A
git commit -m "test: verify EA priority inbox integration"
git push origin feature/ea-priority-inbox
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | EA label constants | 5 min |
| 2 | EA priority sort query | 20 min |
| 3 | Wire to inbox view | 15 min |
| 4 | Auto-advance helper | 10 min |
| 5 | Auto-advance archive | 15 min |
| 6 | Auto-advance send | 10 min |
| 7 | Integration test | 15 min |

**Total:** ~90 minutes
