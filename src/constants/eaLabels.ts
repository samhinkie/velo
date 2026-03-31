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
