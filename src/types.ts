/**
 * Types and interfaces for ICU Neurosurgery Physical Therapy Statistics System
 */

export interface Patient {
  id: string; // Firestore Document ID
  bedValue: string; // 床號
  chartNo: string; // 病歷號碼
  name: string; // 姓名
  diagnosis: string; // 診斷
  consultDate: string; // 照會日期 (YYYY-MM-DD or empty)
  replyDate: string; // 回覆照會日期 (YYYY-MM-DD or empty)
  firstPTDate: string; // 第一次執行日期 (YYYY-MM-DD or empty)
  icuDischargeDate: string; // 轉出加護病房日期 (YYYY-MM-DD or empty)
  icuAdmissionDate: string; // 入ICU日期 (YYYY-MM-DD or empty)
  notes: string; // 備註
  createdAt: number; // millisecond timestamp
  updatedAt: number; // millisecond timestamp
}

export interface PTLog {
  id: string; // Firestore Document ID
  date: string; // 紀錄日期 (YYYY-MM-DD)
  bedValue: string; // 紀錄時床號
  hasIntervention: boolean; // 當天是否有介入
  noInterventionReason: string; // 未介入原因 (if false)
  mobilityLevel: number; // 目前體能活動量等級 (0-10)
  maxInspiratoryPressure?: number | null; // 最大吸氣壓 (cmH₂O, or null if not applicable/measured)
  notes: string; // 備註
  createdAt: number;
  updatedAt: number;
}

export interface AdminConfig {
  passwordHash: string;
  salt: string;
  updatedAt: number;
}

export interface MobilityLevelDetail {
  level: number;
  name: string;
  definition: string;
  color: string;
}

export const ICU_MOBILITY_LEVELS: Record<number, { name: string; definition: string; color: string }> = {
  0: { name: "完全臥床", definition: "被動翻身 / 運動，無主動出力。", color: "bg-slate-200 text-slate-800 border-slate-300" },
  1: { name: "床上活動", definition: "能主動翻身、拱橋或肢體活動。", color: "bg-blue-100 text-blue-800 border-blue-200" },
  2: { name: "被動下床", definition: "用移植機坐至椅子（不站立）。", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  3: { name: "床邊坐起", definition: "軀幹能控制，可稍微扶持坐於床緣。", color: "bg-teal-100 text-teal-800 border-teal-200" },
  4: { name: "站立", definition: "雙腳承重站立（可扶 / 用傾斜床）。", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  5: { name: "轉位至椅", definition: "能站立並轉移重心坐到椅子上。", color: "bg-green-100 text-green-800 border-green-200" },
  6: { name: "原地踏步", definition: "在床邊原地踏步 >=4 次。", color: "bg-amber-100 text-amber-800 border-amber-200" },
  7: { name: "行走 (2人扶)", definition: "需 2 人協助，步行離開床邊 >=5公尺。", color: "bg-orange-100 text-orange-800 border-orange-200" },
  8: { name: "行走 (1人扶)", definition: "需 1 人協助，步行離開床邊 >=5公尺。", color: "bg-rose-100 text-rose-800 border-rose-200" },
  9: { name: "行走 (用輔具)", definition: "獨立使用助行器，步行 >=5公尺。", color: "bg-red-100 text-red-800 border-red-200" },
  10: { name: "獨立行走", definition: "完全無需協助或輔具，步行 >=5公尺。", color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" },
};

// Common reasons for no PT intervention in NS ICU
export const COMMON_NO_INTERVENTION_REASONS = [
  "生命徵象不穩定 (GCS變差/血壓不穩/ICP升高)",
  "鎮靜劑使用中 (RASS指數深沉/無反應)",
  "呼吸器或管路撤移拔管風險高",
  "進行重要檢查/手術或操作中",
  "病患或家屬拒絕/不配合",
  "發燒/嚴重感染或急性休克",
  "其他 (見備註)",
];
