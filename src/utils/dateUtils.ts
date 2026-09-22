import { format } from 'date-fns';

/**
 * Parses a YYYY-MM-DD input string into a local Date object set to 12:00:00 (midday).
 * 
 * Standard `new Date("YYYY-MM-DD")` treats the string as UTC midnight,
 * which in any negative UTC timezone (e.g. UTC-5, UTC-7) shifts backwards
 * by several hours into the previous calendar day (e.g. 5 August becomes 4 August).
 * 
 * Using numeric parts `(year, month - 1, day, 12, 0, 0)` constructs the Date in
 * local timezone at noon, guaranteeing that the calendar day is preserved in all timezones.
 */
export function parseDateInput(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  // Handle "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
  const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = cleanStr.split('-');
  
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }
  
  const d = new Date(dateStr);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Returns today's local date in "YYYY-MM-DD" format for HTML date pickers.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely formats any date-like value (Firestore Timestamp, Date, string, or number)
 * into a human-readable string (default: "dd MMM yyyy").
 */
export function formatDisplayDate(dateVal: any, formatStr: string = 'dd MMM yyyy'): string {
  if (!dateVal) return '-';
  try {
    let d: Date;
    if (typeof dateVal?.toDate === 'function') {
      d = dateVal.toDate();
    } else if (dateVal instanceof Date) {
      d = dateVal;
    } else if (typeof dateVal === 'number') {
      d = new Date(dateVal);
    } else if (typeof dateVal === 'string') {
      d = parseDateInput(dateVal);
    } else if (dateVal?.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else {
      return '-';
    }
    return format(d, formatStr);
  } catch {
    return '-';
  }
}
