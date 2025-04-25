// src/utils/dateUtils.ts
import { format, isToday, isYesterday, startOfDay } from 'date-fns';

/**
 * Formats a timestamp into a human-friendly relative date label.
 * e.g., "Today", "Yesterday", "Monday", "April 19", "Apr 19, 2024"
 */
export const formatDateLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const dateStartOfDay = startOfDay(date);
  const nowStartOfDay = startOfDay(now);

  if (isToday(date)) {
    return 'Today';
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  // Check if it was within the last week (e.g., show day name)
  const diffDays = Math.round(
    (nowStartOfDay.getTime() - dateStartOfDay.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays < 7) {
    return format(date, 'EEEE'); // e.g., "Monday"
  }
  // Check if it's in the current year
  if (date.getFullYear() === now.getFullYear()) {
    return format(date, 'MMMM d'); // e.g., "April 19"
  }
  // Otherwise, show full date
  return format(date, 'MMM d, yyyy'); // e.g., "Apr 19, 2024"
};
