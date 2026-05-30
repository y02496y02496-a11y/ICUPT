/**
 * Utility functions for hashing, date parsing, and math calculations.
 */

/**
 * Hash a text string using the browser's native Web Crypto API (SHA-256)
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): string {
  const array = new Uint32Array(8);
  crypto.getRandomValues(array);
  return Array.from(array).map((num) => num.toString(16).padStart(8, "0")).join("");
}

/**
 * Safely parse date difference in days (date2 - date1)
 * Inputs should be "YYYY-MM-DD" formatted
 */
export function getDaysBetween(date1?: string, date2?: string): number | null {
  if (!date1 || !date2) return null;
  const t1 = new Date(date1).getTime();
  const t2 = new Date(date2).getTime();
  if (isNaN(t1) || isNaN(t2)) return null;
  const diffTime = t2 - t1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Fetch the calendar month (e.g. "2026-05") from "YYYY-MM-DD"
 */
export function getMonthFromDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return "未知月份";
  return dateStr.substring(0, 7);
}

/**
 * Fetch the calendar quarter (e.g. "2026-Q2") from "YYYY-MM-DD"
 */
export function getQuarterFromDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return "未知季度";
  const year = dateStr.substring(0, 4);
  const month = parseInt(dateStr.substring(5, 7), 10);
  if (isNaN(month)) return "未知季度";
  if (month >= 1 && month <= 3) return `${year}年 Q1`;
  if (month >= 4 && month <= 6) return `${year}年 Q2`;
  if (month >= 7 && month <= 9) return `${year}年 Q3`;
  return `${year}年 Q4`;
}

/**
 * Set up CSS background colors based on mobility level
 */
export function getMobilityBarColor(level: number): string {
  if (level <= 1) return "rgba(100, 116, 139, 0.7)"; // Grayish/Slate
  if (level <= 3) return "rgba(6, 182, 212, 0.7)";  // Cyan/Teal
  if (level <= 5) return "rgba(16, 185, 129, 0.7)"; // Emerald
  if (level <= 8) return "rgba(245, 158, 11, 0.7)"; // Amber/Orange
  return "rgba(239, 68, 68, 0.7)";                   // Red/Rose
}
