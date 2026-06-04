import React, { useState, useMemo } from "react";
import { Patient, PTLog, ICU_MOBILITY_LEVELS, COMMON_NO_INTERVENTION_REASONS } from "../types";
import { getDaysBetween, getWeekdayDaysBetween } from "../utils";
import { doc, setDoc, deleteDoc, collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea
} from "recharts";
import {
  ArrowLeft,
  Calendar,
  Activity,
  Plus,
  Edit2,
  Trash2,
  User,
  HeartPlus,
  Notebook,
  AlertTriangle,
  X,
  Stethoscope,
  ChevronRight,
  TrendingUp,
  Award
} from "lucide-react";

interface PatientDetailViewProps {
  patient: Patient;
  logs: PTLog[];
  isAdmin: boolean;
  onBack: () => void;
  onRefreshLogs: () => void;
}

export default function PatientDetailView({
  patient,
  logs,
  isAdmin,
  onBack,
  onRefreshLogs,
}: PatientDetailViewProps) {
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingLog, setEditingLog] = useState<PTLog | null>(null);

  // Form states for adding/editing a log
  const [logDate, setLogDate] = useState(new Date().toISOString().substring(0, 10));
  const [logBedValue, setLogBedValue] = useState(patient.bedValue);
  const [logHasIntervention, setLogHasIntervention] = useState(true);
  const [logNoInterventionReason, setLogNoInterventionReason] = useState(COMMON_NO_INTERVENTION_REASONS[0]);
  const [logCustomReason, setLogCustomReason] = useState("");
  const [logMobilityLevel, setLogMobilityLevel] = useState<number>(0);
  const [logNotes, setLogNotes] = useState("");
  const [logMaxInspiratoryPressure, setLogMaxInspiratoryPressure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Sort logs chronologically for the progress trend line
  const chronologicalLogs = useMemo(() => {
    return [...logs].sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  // Sort logs in reverse chronological order for the timeline/table view
  const reverseLogs = useMemo(() => {
    return [...logs].sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  // Individual statistics metrics
  const patientStats = useMemo(() => {
    const totalCount = logs.length;
    const intervenedCount = logs.filter((l) => l.hasIntervention).length;
    const rate = totalCount > 0 ? Math.round((intervenedCount / totalCount) * 100) : 0;

    // Progression metrics
    const sortedLevels = chronologicalLogs.map((l) => l.mobilityLevel);
    const startLevel = sortedLevels.length > 0 ? sortedLevels[0] : null;
    const maxLevel = sortedLevels.length > 0 ? Math.max(...sortedLevels) : null;
    const currentLevel = sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1] : null;

    // Milestone days
    const icuAdmissionDate = patient.icuAdmissionDate || (patient as any).admissionDate || "";
    const admissionToConsultDays = getDaysBetween(icuAdmissionDate, patient.consultDate);
    const recruitToReplyDays = getWeekdayDaysBetween(patient.consultDate, patient.replyDate);
    const replyToFirstPTDays = getWeekdayDaysBetween(patient.replyDate, patient.firstPTDate);
    const icuStayDays = getDaysBetween(patient.consultDate, patient.icuDischargeDate);
    const firstPTToDischargeDays = getDaysBetween(patient.firstPTDate, patient.icuDischargeDate);
    const totalHospitalDays = getDaysBetween(icuAdmissionDate, patient.icuDischargeDate);

    return {
      total: totalCount,
      intervened: intervenedCount,
      rate,
      startLevel,
      maxLevel,
      currentLevel,
      admissionToConsultDays,
      recruitToReplyDays,
      replyToFirstPTDays,
      icuStayDays,
      firstPTToDischargeDays,
      totalHospitalDays,
    };
  }, [logs, chronologicalLogs, patient]);

  // Open form for adding a log
  function handleOpenAddLog() {
    setEditingLog(null);
    setLogDate(new Date().toISOString().substring(0, 10));
    setLogBedValue(patient.bedValue);
    setLogHasIntervention(true);
    setLogNoInterventionReason(COMMON_NO_INTERVENTION_REASONS[0]);
    setLogCustomReason("");
    setLogMobilityLevel(patientStats.currentLevel !== null ? patientStats.currentLevel : 0);
    setLogNotes("");
    setLogMaxInspiratoryPressure("");
    setFormError("");
    setShowLogForm(true);
  }

  // Open form for editing a log
  function handleOpenEditLog(log: PTLog) {
    setEditingLog(log);
    setLogDate(log.date);
    setLogBedValue(log.bedValue || patient.bedValue);
    setLogHasIntervention(log.hasIntervention);

    // Parse reasons if custom text was used
    if (COMMON_NO_INTERVENTION_REASONS.includes(log.noInterventionReason)) {
      setLogNoInterventionReason(log.noInterventionReason);
      setLogCustomReason("");
    } else {
      setLogNoInterventionReason("其他 (見備註)");
      setLogCustomReason(log.noInterventionReason);
    }

    setLogMobilityLevel(log.mobilityLevel);
    setLogNotes(log.notes);
    setLogMaxInspiratoryPressure(log.maxInspiratoryPressure != null ? String(log.maxInspiratoryPressure) : "");
    setFormError("");
    setShowLogForm(true);
  }

  // Handle Log Save/Submit
  async function handleSaveLog(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!logDate) {
      setFormError("請填寫記錄日期。");
      return;
    }

    const finalReason = logHasIntervention
      ? ""
      : logNoInterventionReason === "其他 (見備註)"
      ? logCustomReason || "其他未介入原因"
      : logNoInterventionReason;

    const parsedMIP = logMaxInspiratoryPressure.trim();
    let mipValue: number | null = null;
    if (parsedMIP !== "") {
      const num = Number(parsedMIP);
      if (!isNaN(num)) {
        mipValue = num;
      }
    }

    try {
      setSubmitting(true);
      const logId = editingLog ? editingLog.id : `log_${Date.now()}`;
      const logsSubcollectionRef = doc(db, "patients", patient.id, "logs", logId);

      const payload: Omit<PTLog, "id"> = {
        date: logDate,
        bedValue: logBedValue || patient.bedValue,
        hasIntervention: logHasIntervention,
        noInterventionReason: finalReason,
        mobilityLevel: logHasIntervention ? Number(logMobilityLevel) : 0,
        maxInspiratoryPressure: mipValue,
        notes: logNotes,
        createdAt: editingLog ? editingLog.createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(logsSubcollectionRef, payload);
      setShowLogForm(false);
      onRefreshLogs();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `patients/${patient.id}/logs`);
      setFormError("儲存日誌發生錯誤，請稍候重試。");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle delete log with confirm
  async function handleDeleteLog(logId: string) {
    if (!window.confirm("確認要刪除這筆每日體能與介入記錄？刪除後無法復原。")) return;

    try {
      const docRef = doc(db, "patients", patient.id, "logs", logId);
      await deleteDoc(docRef);
      onRefreshLogs();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `patients/${patient.id}/logs/${logId}`);
      alert("刪除日誌失敗，請重試！");
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button and profile title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg w-max"
        >
          <ArrowLeft className="w-4 h-4" />
          返回病患列表
        </button>

        {isAdmin && (
          <button
            onClick={handleOpenAddLog}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增每日床邊評估記錄
          </button>
        )}
      </div>

      {/* Patient info details widget card */}
      <div id="patient-profile-card" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-teal-500/30 bg-teal-500/10 flex items-center justify-center text-teal-400">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wide">{patient.name}</span>
                <span className="px-2 py-0.5 bg-teal-500 text-white rounded text-[10px] font-bold tracking-tight">
                  {patient.bedValue} 床
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">病歷號碼：{patient.chartNo}</p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">診斷說明</span>
            <span className="text-sm font-semibold text-slate-200 mt-0.5 inline-block max-w-[280px] break-all">
              {patient.diagnosis}
            </span>
          </div>
        </div>

        {/* Process Milestone Milestones Dates */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-5 gap-3.5 text-xs">
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-400 font-bold tracking-wide">入ICU日期</span>
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              {patient.icuAdmissionDate || (patient as any).admissionDate || "未設定"}
            </div>
            {patientStats.totalHospitalDays !== null && (
              <span className="text-[10px] text-slate-400 block pt-0.5">
                ICU住院累計：<strong className="text-blue-600 font-bold">{patientStats.totalHospitalDays}</strong> 天
              </span>
            )}
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-400 font-bold tracking-wide">照會日期</span>
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {patient.consultDate || "未設定"}
            </div>
            {patientStats.admissionToConsultDays !== null && (
              <span className="text-[10px] text-slate-400 block pt-0.5">
                入ICU➔照會：<strong className="text-slate-600 font-bold">{patientStats.admissionToConsultDays}</strong> 天
              </span>
            )}
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-400 font-bold tracking-wide">醫師回覆照會</span>
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {patient.replyDate || "未設定"}
            </div>
            {patientStats.recruitToReplyDays !== null && (
              <span className="text-[10px] text-slate-400 block pt-0.5">
                照會➔回覆：<strong className="text-indigo-600 font-bold">{patientStats.recruitToReplyDays}</strong> 天
              </span>
            )}
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-400 font-bold tracking-wide">第一次床邊執行</span>
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              {patient.firstPTDate || "未設定"}
            </div>
            {patientStats.replyToFirstPTDays !== null && (
              <span className="text-[10px] text-slate-400 block pt-0.5">
                回覆➔執行：<strong className="text-emerald-600 font-bold">{patientStats.replyToFirstPTDays}</strong> 天
              </span>
            )}
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1 col-span-2 md:col-span-1">
            <span className="text-slate-400 font-bold tracking-wide">轉出加護病房</span>
            <div className="text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-rose-500" />
              {patient.icuDischargeDate || "住院/追蹤中"}
            </div>
            {patientStats.icuStayDays !== null && (
              <span className="text-[10px] text-slate-400 block pt-0.5">
                ICU停留期：<strong className="text-rose-600 font-bold">{patientStats.icuStayDays}</strong> 天
              </span>
            )}
          </div>
        </div>

        {/* Notes statement */}
        {patient.notes && (
          <div className="px-6 py-3 bg-slate-50 text-[11px] text-slate-500 italic border-b border-slate-200">
            <span className="font-bold text-slate-600 not-italic block mb-0.5">收案個案備註：</span>
            {patient.notes}
          </div>
        )}

        {/* Therapy Statistics Mini Dashboard */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[11px] text-slate-400 font-bold">評估與評分日</span>
            <p className="text-2xl font-extrabold text-slate-800">{patientStats.total} <span className="text-xs text-slate-400 font-normal">天</span></p>
          </div>
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[11px] text-slate-400 font-bold">實際介入天數</span>
            <p className="text-2xl font-extrabold text-teal-600">{patientStats.intervened} <span className="text-xs text-slate-400 font-normal">天</span></p>
          </div>
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[11px] text-slate-400 font-bold">個人介入執行率</span>
            <p className="text-2xl font-extrabold text-indigo-600">{patientStats.rate}%</p>
          </div>
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[11px] text-slate-400 font-bold">治療成效進度</span>
            <p className="text-2xl font-extrabold text-slate-800 flex items-center justify-center md:justify-start gap-1">
              <span className="text-slate-400 text-xs font-normal">首日:</span>
              <span className="font-mono text-slate-500">{patientStats.startLevel !== null ? patientStats.startLevel : "-"}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="text-teal-500 text-xs font-normal">最高:</span>
              <span className="font-mono text-teal-600">{patientStats.maxLevel !== null ? patientStats.maxLevel : "-"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Complete patient progress tracking chart and efficacy analysis (歷程進度曲線) */}
      <div id="patient-progress-chart" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              物理治療體能等級進步變化圖 (ICU Mobility Scale 0-10)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">顯示個案每日活動能力等級升降趨勢，曲線向上表示活動受損在主動復健下有所改善</p>
          </div>
          {patientStats.maxLevel !== null && patientStats.startLevel !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 text-xs font-bold">
              <Award className="w-4 h-4 text-teal-600 shrink-0" />
              成效分析：累計進步 {Math.max(0, patientStats.maxLevel - patientStats.startLevel)} 個等級
            </div>
          )}
        </div>

        <div className="h-[260px] w-full">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Notebook className="w-8 h-8 mb-2 stroke-1" />
              <span className="text-xs">目前沒有每日床邊評估記錄，無法計算變化曲線</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chronologicalLogs} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 10]} ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                  formatter={(value: any, name: any, props: any) => [
                    `級別 ${value} : ${ICU_MOBILITY_LEVELS[Number(value)]?.name || ""}`,
                    "體能活動量等級",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="mobilityLevel"
                  name="體能等級"
                  stroke="#14b8a6"
                  strokeWidth={3}
                  activeDot={{ r: 6 }}
                  dot={{ r: 4, strokeWidth: 1 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Evaluation Log Lists */}
      <div id="patient-logs-timeline" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Notebook className="w-4.5 h-4.5 text-slate-600" />
            <h4 className="font-bold text-slate-800 text-sm">每日床邊復健評估及活動紀錄明細</h4>
          </div>
          <span className="text-xs font-mono text-slate-400">共 {logs.length} 筆紀錄</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 text-[11px] font-bold uppercase bg-slate-50">
                <th className="py-3 px-4">評估日期</th>
                <th className="py-3 px-4">當時床號</th>
                <th className="py-3 px-4">當日介入</th>
                <th className="py-3 px-4">未介入原因</th>
                <th className="py-3 px-4">目前體能等級狀況 (ICU Mobility Scale)</th>
                <th className="py-3 px-4 text-center">最大吸氣壓 (MIP)</th>
                <th className="py-3 px-4">日誌/備註</th>
                {isAdmin && <th className="py-3 px-4 text-center">操作權限</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {reverseLogs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-slate-400 font-medium">
                    尚無這名病患的每日床邊記錄，請點選右上角「新增每日床邊評估記錄」起案。
                  </td>
                </tr>
              ) : (
                reverseLogs.map((log) => {
                  const levelInfo = ICU_MOBILITY_LEVELS[log.mobilityLevel];
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">
                        {log.date}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {log.bedValue || patient.bedValue}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.hasIntervention ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded">
                            <HeartPlus className="w-3 h-3 text-teal-600" />
                            有介入
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            未介入
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {log.hasIntervention ? <span className="text-slate-300">-</span> : log.noInterventionReason}
                      </td>
                      <td className="py-3 px-4">
                        {log.hasIntervention ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold text-white bg-teal-500 rounded-full shrink-0">
                              {log.mobilityLevel}
                            </span>
                            <span className="text-slate-700 font-medium">{levelInfo?.name}</span>
                            <span className="text-[10px] text-slate-400 hidden sm:inline">({levelInfo?.definition})</span>
                          </div>
                        ) : (
                          <span className="text-slate-350 font-semibold text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700 whitespace-nowrap font-mono">
                        {log.maxInspiratoryPressure != null ? (
                          <span className="text-indigo-600">
                            {log.maxInspiratoryPressure} <span className="text-[9px] font-normal text-slate-400 font-sans">cmH₂O</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] break-all">
                        {log.notes || <span className="text-slate-300">無備註</span>}
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEditLog(log)}
                              className="p-1 text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded cursor-pointer transition-colors"
                              title="編輯此日誌"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="p-1 text-rose-500 hover:text-rose-800 border border-slate-200 hover:border-rose-300 rounded cursor-pointer transition-colors"
                              title="刪除此日誌"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Log Form Modal Modal Screen */}
      {showLogForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-lg rounded-xl overflow-hidden shadow-2xl animate-scaleIn">
            {/* Modal Head Header */}
            <div className="bg-slate-850 px-5 py-4 border-b border-slate-200 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4.5 h-4.5 text-teal-400" />
                <h4 className="font-bold text-sm">
                  {editingLog ? "編輯每日評估評分" : "新增每日床邊評估評分"}
                </h4>
              </div>
              <button
                onClick={() => setShowLogForm(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveLog} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="eval-date-input">評估日期 <span className="text-rose-500">*</span></label>
                  <input
                    id="eval-date-input"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="block w-full text-xs p-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="eval-bed-input">當時床號 <span className="text-rose-500">*</span></label>
                  <input
                    id="eval-bed-input"
                    type="text"
                    value={logBedValue}
                    onChange={(e) => setLogBedValue(e.target.value)}
                    placeholder="請輸入目前床位"
                    className="block w-full text-xs p-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800"
                    required
                  />
                </div>
              </div>

              {/* Intervention check */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">當天是否有執行物理治療介入？ <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLogHasIntervention(true)}
                    className={`py-2 px-4 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      logHasIntervention
                        ? "bg-teal-50 border-teal-500 text-teal-700 font-extrabold ring-1 ring-teal-500"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-150"
                    }`}
                  >
                    有介入
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogHasIntervention(false)}
                    className={`py-2 px-4 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      !logHasIntervention
                        ? "bg-rose-50 border-rose-500 text-rose-700 font-extrabold ring-1 ring-rose-500"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-150"
                    }`}
                  >
                    未介入
                  </button>
                </div>
              </div>

              {/* Reasons if Not Intervened */}
              {!logHasIntervention && (
                <div className="space-y-2.5 animate-fadeIn">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="no-pt-reason-select">請選擇未介入之核心原因</label>
                    <select
                      id="no-pt-reason-select"
                      value={logNoInterventionReason}
                      onChange={(e) => setLogNoInterventionReason(e.target.value)}
                      className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800"
                    >
                      {COMMON_NO_INTERVENTION_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>
                  {logNoInterventionReason === "其他 (見備註)" && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="custom-reason-input">補述其他未介入原因</label>
                      <input
                        id="custom-reason-input"
                        type="text"
                        value={logCustomReason}
                        onChange={(e) => setLogCustomReason(e.target.value)}
                        placeholder="請鍵入補述原因"
                        className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800"
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* ICU Mobility scale levels select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="mobility-level-select">目前體能活動量等級 (ICU Mobility Scale 0-10)</label>
                  {logHasIntervention ? (
                    <select
                      id="mobility-level-select"
                      value={logMobilityLevel}
                      onChange={(e) => setLogMobilityLevel(Number(e.target.value))}
                      className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 font-medium outline-none text-slate-800"
                    >
                      {Object.entries(ICU_MOBILITY_LEVELS).map(([level, info]) => (
                        <option key={level} value={level}>
                          等級 {level}：{info.name} - ({info.definition})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-semibold flex items-center h-[38px]">
                      <span>⚠️ 未執行物理治療介入，此項不需評量等級</span>
                    </div>
                  )}
                </div>

                {/* Diaphragm Muscle Strength MIP */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="mip-input">
                    橫膈膜肌力評估 - 最大吸氣壓 (cmH₂O)
                  </label>
                  <div className="relative">
                    <input
                      id="mip-input"
                      type="number"
                      step="any"
                      value={logMaxInspiratoryPressure}
                      onChange={(e) => setLogMaxInspiratoryPressure(e.target.value)}
                      placeholder="無或未量測則留空"
                      className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 font-mono pr-16"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded font-sans">
                        cmH₂O
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes check */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="log-notes-text">床邊日誌 / 評估備註</label>
                <textarea
                  id="log-notes-text"
                  rows={3}
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="可在此鍵入關聯評估說明、管路排除情形、或特殊反應等備忘細節..."
                  className="block w-full text-xs p-2 rounded-lg border border-slate-300 bg-slate-50 outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowLogForm(false)}
                  className="py-2 px-4 border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 rounded-lg transition-colors cursor-pointer"
                  disabled={submitting}
                >
                  取消離去
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                  disabled={submitting}
                >
                  {submitting ? "提交儲存中..." : "確認並存檔"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
