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
 * Calculates date difference excluding Saturdays and Sundays.
 * Inputs should be "YYYY-MM-DD" formatted.
 */
export function getWeekdayDaysBetween(date1?: string, date2?: string): number | null {
  if (!date1 || !date2) return null;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

  // Set times to midnight to avoid timezone/time differences issues
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  if (d1.getTime() === d2.getTime()) return 0;
  
  const isReverse = d1 > d2;
  const start = isReverse ? new Date(d2) : new Date(d1);
  const end = isReverse ? new Date(d1) : new Date(d2);

  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const day = current.getDay(); // 0 is Sunday, 6 is Saturday
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return isReverse ? -count : count;
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

/**
 * Gets GCS classification severity name and tailwind text/bg color.
 * Standard GCS (E + V + M = 3 to 15):
 * Mild: 13-15
 * Moderate: 9-12
 * Severe: 3-8
 * 
 * Unscoreable GCS (V is "a" | "e" | "t", sum of other components E + M = 2 to 10):
 * Mild: 9-10
 * Moderate: 6-8
 * Severe: 2-5
 */
export function getGcsSeverity(
  score: number | string | null | undefined,
  isUnscoreableVParam?: boolean
): { name: string; color: string } | null {
  if (score == null || score === "") return null;
  const scoreStr = String(score).trim();
  
  // Try to find the first sequence of digits in the string
  const match = scoreStr.match(/^(\d+)/) || scoreStr.match(/(\d+)/);
  const numScore = match ? Number(match[1]) : Number(score);
  
  if (isNaN(numScore)) {
    return { name: "無法評分", color: "text-slate-500 bg-slate-50 border-slate-200" };
  }
  
  const isUnscoreableV = !!(
    isUnscoreableVParam ||
    (typeof score === "string" && (
      scoreStr.includes("失語症") ||
      scoreStr.includes("插管中") ||
      scoreStr.includes("氣切") ||
      /\([aet]\)/i.test(scoreStr)
    ))
  );

  if (isUnscoreableV) {
    if (numScore < 2 || numScore > 10) return null;
    if (numScore >= 9) {
      return { name: "輕度 (Mild)", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    } else if (numScore >= 6) {
      return { name: "中度 (Moderate)", color: "text-amber-700 bg-amber-50 border-amber-200" };
    } else {
      return { name: "重度 (Severe)", color: "text-rose-700 bg-rose-50 border-rose-200" };
    }
  } else {
    if (numScore < 3 || numScore > 15) return null;
    if (numScore >= 13) {
      return { name: "輕度 (Mild)", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    } else if (numScore >= 9) {
      return { name: "中度 (Moderate)", color: "text-amber-700 bg-amber-50 border-amber-200" };
    } else {
      return { name: "重度 (Severe)", color: "text-rose-700 bg-rose-50 border-rose-200" };
    }
  }
}

export interface GcsComputationResult {
  totalDisplay: string; // e.g. "15分", "10分 (插管中)"
  totalScoreValue: number | string | null; // For database storage
  sumScore: number | null; // meaningful numeric score (3-15 or 2-10)
  isUnscoreableV: boolean;
  unscoreableReason: string; // "失語症" | "插管中" | "氣切" | ""
  severity: { name: string; color: string } | null;
  formula: string; // e.g. "E4 V5 M6" or "E4 V(e) M6"
  isComplete: boolean;
}

/**
 * Computes GCS sum, unscoreable verbal reason, and clinical severity.
 */
export function computeGcsResult(
  eye: number | string | null | undefined,
  verbal: number | string | null | undefined,
  motor: number | string | null | undefined
): GcsComputationResult {
  const hasE = eye !== "" && eye != null;
  const hasV = verbal !== "" && verbal != null;
  const hasM = motor !== "" && motor != null;

  const eNum = hasE ? Number(eye) : null;
  const mNum = hasM ? Number(motor) : null;
  
  let vVal: number | string | null = null;
  if (hasV) {
    if (verbal === "a" || verbal === "e" || verbal === "t") {
      vVal = verbal;
    } else {
      const parsed = Number(verbal);
      vVal = isNaN(parsed) ? String(verbal) : parsed;
    }
  }

  const isUnscoreableV = vVal === "a" || vVal === "e" || vVal === "t";
  let reason = "";
  if (vVal === "a") reason = "失語症";
  else if (vVal === "e") reason = "插管中";
  else if (vVal === "t") reason = "氣切";

  const formulaParts = [
    eNum !== null ? `E${eNum}` : "E-",
    vVal !== null ? (isUnscoreableV ? `V(${vVal})` : `V${vVal}`) : "V-",
    mNum !== null ? `M${mNum}` : "M-",
  ];
  const formula = formulaParts.join(" ");

  if (!hasE && !hasV && !hasM) {
    return {
      totalDisplay: "未評估",
      totalScoreValue: null,
      sumScore: null,
      isUnscoreableV: false,
      unscoreableReason: "",
      severity: null,
      formula: "",
      isComplete: false,
    };
  }

  if (eNum !== null && mNum !== null && hasV) {
    if (isUnscoreableV) {
      const sumOther = eNum + mNum;
      const sev = getGcsSeverity(sumOther, true);
      return {
        totalDisplay: `${sumOther}分 (${reason})`,
        totalScoreValue: `${sumOther}分 (${reason})`,
        sumScore: sumOther,
        isUnscoreableV: true,
        unscoreableReason: reason,
        severity: sev,
        formula,
        isComplete: true,
      };
    } else if (typeof vVal === "number" && !isNaN(vVal)) {
      const total = eNum + vVal + mNum;
      const sev = getGcsSeverity(total, false);
      return {
        totalDisplay: `${total}分`,
        totalScoreValue: total,
        sumScore: total,
        isUnscoreableV: false,
        unscoreableReason: "",
        severity: sev,
        formula,
        isComplete: true,
      };
    }
  }

  return {
    totalDisplay: "未完成評估",
    totalScoreValue: null,
    sumScore: null,
    isUnscoreableV,
    unscoreableReason: reason,
    severity: null,
    formula,
    isComplete: false,
  };
}


