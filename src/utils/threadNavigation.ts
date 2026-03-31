// src/utils/threadNavigation.ts

import { useThreadStore } from "@/stores/threadStore";

/**
 * Find the next thread to select after removing the current one.
 * Prefers the thread after current, falls back to before.
 * 
 * @param currentId - The ID of the thread being removed
 * @returns The ID of the next thread to select, or null if inbox will be empty
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
 * Remove a thread from the store and auto-advance to the next one.
 * Used after archive/delete/send to maintain single-focus flow.
 * 
 * @param threadId - The ID of the thread to remove
 */
export function removeAndAdvance(threadId: string): void {
  const nextId = getNextThreadId(threadId);
  const store = useThreadStore.getState();
  
  store.removeThread(threadId);
  
  if (nextId) {
    store.selectThread(nextId);
  }
}
