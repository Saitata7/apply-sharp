/**
 * Extracts application deadline dates from job description text.
 */

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

// Matches "Month Day, Year" or "Month Day Year" (e.g. "March 15, 2026")
const NAMED_DATE = /(\w+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;
// Matches "MM/DD/YYYY" or "MM-DD-YYYY"
const NUMERIC_DATE = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;

// Deadline context patterns — each captures the date portion after the keyword
const DEADLINE_PATTERNS: RegExp[] = [
  /(?:application\s+)?deadline[:\s]+(.+?)(?:\.|$)/im,
  /apply\s+by\s+(.+?)(?:\.|$)/im,
  /closing\s+date[:\s]+(.+?)(?:\.|$)/im,
  /applications?\s+(?:close|closes|due|must\s+be\s+(?:received|submitted))\s+(?:by|on|before)\s+(.+?)(?:\.|$)/im,
  /position\s+(?:open|available)\s+until\s+(.+?)(?:\.|$)/im,
  /submissions?\s+(?:due|close|closes)\s+(?:by|on)?\s*(.+?)(?:\.|$)/im,
  /(?:open\s+)?until\s+filled\s+or\s+(.+?)(?:\.|$)/im,
  /accept(?:ing)?\s+applications?\s+(?:through|until|till)\s+(.+?)(?:\.|$)/im,
];

function parseNamedDate(text: string): Date | null {
  const match = text.match(NAMED_DATE);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const month = MONTH_NAMES[monthName];
  if (month === undefined) return null;

  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (day < 1 || day > 31) return null;
  if (year < 2024 || year > 2030) return null;

  return new Date(year, month, day);
}

function parseNumericDate(text: string): Date | null {
  const match = text.match(NUMERIC_DATE);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 2024 || year > 2030) return null;

  return new Date(year, month - 1, day);
}

function parseDateFromFragment(fragment: string): Date | null {
  const trimmed = fragment.trim().substring(0, 60); // limit search area
  return parseNamedDate(trimmed) || parseNumericDate(trimmed);
}

function isValidDeadline(date: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Reject past dates (more than 1 day ago to handle timezone edge cases)
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date < yesterday) return false;

  // Reject dates more than 1 year in the future (likely noise)
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (date > oneYearFromNow) return false;

  return true;
}

export function extractDeadlineFromJD(description: string): Date | null {
  if (!description) return null;

  for (const pattern of DEADLINE_PATTERNS) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const date = parseDateFromFragment(match[1]);
      if (date && isValidDeadline(date)) {
        return date;
      }
    }
  }

  return null;
}
