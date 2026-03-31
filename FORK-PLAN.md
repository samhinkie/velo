# Velo Fork Plan — EA-Priority + Auto-Advance

## Goal
1. Sort: Recent drafts → 1-High → 2-Medium → 3-Low → 4-Archive (date desc within each)
2. Auto-advance: After send/archive, open next email (don't return to list)

---

## Change 1: Custom Sort Query

### File: `src/services/db/threads.ts`

### New function (add this):

```typescript
/**
 * Get threads sorted by EA priority:
 * 1. Drafts from last 7 days (most recent first)
 * 2. 1-High (most recent first)
 * 3. 2-Medium (most recent first)
 * 4. 3-Low (most recent first)
 * 5. 4-Archive (most recent first)
 * 6. Everything else (most recent first)
 */
export async function getThreadsEAPriority(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
       -- Priority bucket: 0=recent draft, 1=High, 2=Medium, 3=Low, 4=Archive, 99=other
       CASE
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_draft 
           WHERE tl_draft.account_id = t.account_id 
             AND tl_draft.thread_id = t.id 
             AND tl_draft.label_id = 'DRAFT'
             AND t.last_message_at > $2
         ) THEN 0
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_high
           WHERE tl_high.account_id = t.account_id 
             AND tl_high.thread_id = t.id 
             AND tl_high.label_id = 'Label_8991603863627201242'
         ) THEN 1
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_med
           WHERE tl_med.account_id = t.account_id 
             AND tl_med.thread_id = t.id 
             AND tl_med.label_id = 'Label_8180608479175321517'
         ) THEN 2
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_low
           WHERE tl_low.account_id = t.account_id 
             AND tl_low.thread_id = t.id 
             AND tl_low.label_id = 'Label_8508363860079466600'
         ) THEN 3
         WHEN EXISTS (
           SELECT 1 FROM thread_labels tl_arch
           WHERE tl_arch.account_id = t.account_id 
             AND tl_arch.thread_id = t.id 
             AND tl_arch.label_id = 'Label_4139896242361942875'
         ) THEN 4
         ELSE 99
       END as ea_priority
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX'
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, ea_priority ASC, t.last_message_at DESC
     LIMIT $3 OFFSET $4`,
    [accountId, sevenDaysAgo, limit, offset],
  );
}
```

### Wire it up:

In the component that loads threads (likely `src/components/layout/EmailList.tsx`), call `getThreadsEAPriority()` instead of `getThreadsForAccount()` when in inbox view.

---

## Change 2: Auto-Advance After Archive/Send

### File: `src/hooks/useKeyboardShortcuts.ts`

### Current behavior (archive case ~line 180):
```typescript
case "action.archive": {
  if (selectedId && activeAccountId) {
    await archiveThread(activeAccountId, selectedId, []);
  }
  break;
}
```

### New behavior:
```typescript
case "action.archive": {
  if (selectedId && activeAccountId) {
    // Find next thread before removing current
    const threads = useThreadStore.getState().threads;
    const currentIdx = threads.findIndex(t => t.id === selectedId);
    const nextThread = threads[currentIdx + 1] || threads[currentIdx - 1];
    
    await archiveThread(activeAccountId, selectedId, []);
    useThreadStore.getState().removeThread(selectedId);
    
    // Auto-advance to next thread
    if (nextThread) {
      useThreadStore.getState().selectThread(nextThread.id);
    }
  }
  break;
}
```

### Also apply to:
- `action.delete` (trash)
- `action.spam`
- Send action in Composer

---

## Change 3: Stay in Thread View (Don't Return to List)

### File: `src/stores/uiStore.ts` or equivalent

Check if there's a "reading pane mode" setting. If the UI returns to list after archive, we need to ensure it stays in the reading pane with the next thread selected.

Look for:
- `setSelectedThread(null)` calls after archive — remove them
- Reading pane visibility logic — ensure it stays visible when auto-advancing

---

## Label IDs Reference

```
DRAFT:     DRAFT (Gmail system label)
1-High:    Label_8991603863627201242
2-Medium:  Label_8180608479175321517
3-Low:     Label_8508363860079466600
4-Archive: Label_4139896242361942875
```

---

## Implementation Order

1. **Sort query** (~30 min)
   - Add `getThreadsEAPriority()` to threads.ts
   - Wire to EmailList component

2. **Auto-advance** (~30 min)
   - Modify archive/delete/spam handlers
   - Test with keyboard shortcuts

3. **Stay in thread view** (~15 min)
   - Audit post-action behavior
   - Remove any "return to list" logic

4. **Test full flow** (~15 min)
   - Open email → Reply → Send → Next email opens
   - Open email → Archive (e) → Next email opens

**Total: ~90 minutes**

---

## Config (Future)

Make label IDs configurable in settings instead of hardcoded:

```typescript
// src/constants/eaLabels.ts
export const EA_LABELS = {
  HIGH: 'Label_8991603863627201242',
  MEDIUM: 'Label_8180608479175321517',
  LOW: 'Label_8508363860079466600',
  ARCHIVE: 'Label_4139896242361942875',
};
```

Then add a Settings UI to override these if EA's labels change.
