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
  rassScore?: number | null; // RASS 評估分數 (+4 to -5)
  gcsEye?: number | null; // GCS 睜眼反應 (1-4)
  gcsVerbal?: number | null; // GCS 語言反應 (1-5)
  gcsMotor?: number | null; // GCS 運動反應 (1-6)
  gcsTotal?: number | null; // GCS 總分 (3-15)
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

export const RASS_SCORES: Record<number, { name: string; definition: string; color: string }> = {
  4: { name: "+4 好鬥 (Combative)", definition: "具攻擊性，有暴力行為，對工作人員有立即危險。", color: "text-rose-700 bg-rose-50 border-rose-200" },
  3: { name: "+3 非常躁動 (Very agitated)", definition: "試圖拔除呼吸管、鼻胃管或點滴等醫療設備。", color: "text-red-700 bg-red-50 border-red-200" },
  2: { name: "+2 躁動焦慮 (Agitated)", definition: "身體激烈移動，無法配合呼吸器。", color: "text-orange-700 bg-orange-50 border-orange-200" },
  1: { name: "+1 不安焦慮 (Restless)", definition: "焦慮緊張，但身體僅輕微移動。", color: "text-amber-700 bg-amber-50 border-amber-200" },
  0: { name: "0 清醒平靜 (Alert and calm)", definition: "清醒，處於自然狀態。", color: "text-slate-700 bg-slate-50 border-slate-200" },
  [-1]: { name: "-1 昏昏欲睡 (Drowsy)", definition: "未完全清醒，但聽見聲音後能維持清醒超過 10 秒。", color: "text-blue-600 bg-blue-50/50 border-blue-100" },
  [-2]: { name: "-2 輕度鎮靜 (Light sedation)", definition: "聽見聲音有反應，但無法維持清醒超過 10 秒。", color: "text-indigo-600 bg-indigo-50/50 border-indigo-100" },
  [-3]: { name: "-3 中度鎮靜 (Moderate sedation)", definition: "對聲音有反應，但無持續維持清醒的狀態。", color: "text-cyan-600 bg-cyan-50/50 border-cyan-100" },
  [-4]: { name: "-4 重度鎮靜 (Deep sedation)", definition: "無法清醒，但對身體刺激有反應 (例如拍打或捏痛)。", color: "text-purple-600 bg-purple-50/50 border-purple-100" },
  [-5]: { name: "-5 昏迷 (Unarousable)", definition: "對聲音及身體刺激均完全無反應。", color: "text-slate-600 bg-slate-100 border-slate-300" },
};

export const GCS_EYE_OPTIONS = [
  { value: 4, label: "E4 - 主動動作 (Spontaneous)" },
  { value: 3, label: "E3 - 對聲音 (To speech)" },
  { value: 2, label: "E2 - 對疼痛 (To pain)" },
  { value: 1, label: "E1 - 無反應 (No response)" },
];

export const GCS_VERBAL_OPTIONS = [
  { value: 5, label: "V5 - 答話有條理 (Oriented)" },
  { value: 4, label: "V4 - 答話混亂 (Confused)" },
  { value: 3, label: "V3 - 答非所問/不適當字詞 (Inappropriate words)" },
  { value: 2, label: "V2 - 無意義聲音/無法理解 (Incomprehensible sounds)" },
  { value: 1, label: "V1 - 無反應 (No response)" },
];

export const GCS_MOTOR_OPTIONS = [
  { value: 6, label: "M6 - 遵從指示 (Obeys commands)" },
  { value: 5, label: "M5 - 疼痛定位 (Localizes pain)" },
  { value: 4, label: "M4 - 疼痛避開 (Withdraws)" },
  { value: 3, label: "M3 - 異常屈曲 (Abnormal flexion / Decorticate)" },
  { value: 2, label: "M2 - 異常伸展 (Abnormal extension / Decerebrate)" },
  { value: 1, label: "M1 - 無反應 (No response)" },
];

