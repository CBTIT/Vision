import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Hover ring + motion for clickable `Card` blocks site-wide. Add `hover:bg-*` when needed. */
export const CLICKABLE_CARD_HOVER =
  "cursor-pointer transition-[background-color,box-shadow] duration-200 hover:shadow-sm hover:ring-2 hover:ring-primary/45 dark:hover:ring-primary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Same as `CLICKABLE_CARD_HOVER` with a rose ring for crash / destructive-styled session rows. */
export const CLICKABLE_CARD_HOVER_ROSE =
  "cursor-pointer transition-[background-color,box-shadow] duration-200 hover:shadow-sm hover:ring-2 hover:ring-rose-400/50 dark:hover:ring-rose-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Clickable `<tr>` rows: inset ring reads well inside bordered tables. */
export const CLICKABLE_TABLE_ROW_HOVER =
  "cursor-pointer transition-[background-color,box-shadow] duration-150 hover:bg-muted/30 hover:shadow-sm hover:ring-2 hover:ring-inset hover:ring-primary/35 dark:hover:ring-primary/45"
