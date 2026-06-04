import { useState, useMemo } from "react";
import { Patient, PTLog, ICU_MOBILITY_LEVELS } from "../types";
import { getDaysBetween, getWeekdayDaysBetween, getMonthFromDate, getQuarterFromDate, getMobilityBarColor, getGcsSeverity } from "../utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  CalendarRange,
  Download,
  Activity,
  FileSpreadsheet,
  AlertCircle,
  TrendingUp,
  Clock,
  BriefcaseMedical,
  FileOutput,
  Info,
  Printer,
  FileText,
  Search,
  SlidersHorizontal
} from "lucide-react";

interface StatisticsDashboardProps {
  patients: Patient[];
  allLogs: { [patientId: string]: PTLog[] };
  isAdmin?: boolean;
}

export default function StatisticsDashboard({ patients, allLogs, isAdmin = false }: StatisticsDashboardProps) {
  // Advanced Date Filter States
  const [filterType, setFilterType] = useState<"all" | "year" | "month" | "custom">("all");
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-05");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // New filters: specific patient selection and physical mobility level selection
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const [selectedMobilityLevel, setSelectedMobilityLevel] = useState<string>("all");
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState<string>("");

  // Helper list to search and filter the drops for patient dropdown
  const filteredPatientDropdownList = useMemo(() => {
    const query = dashboardSearchQuery.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.bedValue.toLowerCase().includes(query) ||
        p.chartNo.toLowerCase().includes(query)
    );
  }, [patients, dashboardSearchQuery]);

  // Selected patient object
  const selectedPatientObj = useMemo(() => {
    if (selectedPatientId === "all") return null;
    return patients.find((p) => p.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  // Flatten all logs with patient information attached
  const processedLogs = useMemo(() => {
    const list: (PTLog & { patientId: string; patientName: string; bedValue: string })[] = [];
    patients.forEach((patient) => {
      const logs = allLogs[patient.id] || [];
      logs.forEach((log) => {
        list.push({
          ...log,
          patientId: patient.id,
          patientName: patient.name,
          // Fallback to patient profile bed if log bed doesn't exist
          bedValue: log.bedValue || patient.bedValue,
        });
      });
    });
    // Sort logs descending by date
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [patients, allLogs]);

  // Apply visual time-range and custom selection filters (patient name, mobility level)
  const filteredLogs = useMemo(() => {
    return processedLogs.filter((log) => {
      // 1. Patient selection filter
      if (selectedPatientId !== "all" && log.patientId !== selectedPatientId) {
        return false;
      }
      // 2. Mobility level filter
      if (selectedMobilityLevel !== "all" && String(log.mobilityLevel) !== selectedMobilityLevel) {
        return false;
      }
      // 3. Time period filter
      if (filterType === "all") return true;
      if (filterType === "year") {
        return log.date.startsWith(selectedYear);
      }
      if (filterType === "month") {
        return log.date.startsWith(selectedMonth);
      }
      if (filterType === "custom") {
        const afterStart = startDate ? log.date >= startDate : true;
        const beforeEnd = endDate ? log.date <= endDate : true;
        return afterStart && beforeEnd;
      }
      return true;
    });
  }, [processedLogs, filterType, selectedYear, selectedMonth, startDate, endDate, selectedPatientId, selectedMobilityLevel]);

  // Derived filtered patients (patients that have records in filtered logs, or matches dates)
  const filteredPatients = useMemo(() => {
    // If a specific patient is filtered, return just that patient
    if (selectedPatientId !== "all") {
      return patients.filter((p) => p.id === selectedPatientId);
    }

    if (filterType === "all") {
      let list = patients;
      if (selectedMobilityLevel !== "all") {
        const patientIdsWithLevel = new Set(processedLogs.filter(log => String(log.mobilityLevel) === selectedMobilityLevel).map(log => log.patientId));
        list = list.filter((p) => patientIdsWithLevel.has(p.id));
      }
      return list;
    }

    const patientIdsInPeriod = new Set(filteredLogs.map((log) => log.patientId));
    let result = patients.filter((p) => {
      // Either has logs in selected period, or was active (consulted/entered)
      const matchesPeriod = patientIdsInPeriod.has(p.id);
      if (matchesPeriod) return true;

      // If no logs, check if dates match
      if (filterType === "year") {
        return p.consultDate?.startsWith(selectedYear) || p.firstPTDate?.startsWith(selectedYear);
      }
      if (filterType === "month") {
        return p.consultDate?.startsWith(selectedMonth) || p.firstPTDate?.startsWith(selectedMonth);
      }
      if (filterType === "custom") {
        const consultAfter = startDate && p.consultDate ? p.consultDate >= startDate : true;
        const consultBefore = endDate && p.consultDate ? p.consultDate <= endDate : true;
        return consultAfter && consultBefore;
      }
      return false;
    });

    if (selectedMobilityLevel !== "all") {
      const patientIdsWithLevel = new Set(filteredLogs.filter(log => String(log.mobilityLevel) === selectedMobilityLevel).map(log => log.patientId));
      result = result.filter((p) => patientIdsWithLevel.has(p.id));
    }

    return result;
  }, [patients, filteredLogs, filterType, selectedYear, selectedMonth, startDate, endDate, selectedPatientId, selectedMobilityLevel, processedLogs]);

  // 1. Calculate Physical Therapy Execution Rate (復健介入執行率)
  const executionStats = useMemo(() => {
    const totalCount = filteredLogs.length;
    if (totalCount === 0) return { total: 0, intervened: 0, rate: 0 };
    const intervenedCount = filteredLogs.filter((log) => log.hasIntervention).length;
    return {
      total: totalCount,
      intervened: intervenedCount,
      rate: Math.round((intervenedCount / totalCount) * 1000) / 10,
    };
  }, [filteredLogs]);

  // 2. Consultation, Reply, and Initiation Speeds (照會回覆與開案時效分析)
  const referralSpeeds = useMemo(() => {
    let consultToReplySum = 0;
    let consultToReplyCount = 0;
    let replyToInitiateSum = 0;
    let replyToInitiateCount = 0;

    filteredPatients.forEach((p) => {
      const daysToReply = getWeekdayDaysBetween(p.consultDate, p.replyDate);
      if (daysToReply !== null && daysToReply >= 0) {
        consultToReplySum += daysToReply;
        consultToReplyCount++;
      }

      const daysToInitiate = getWeekdayDaysBetween(p.replyDate, p.firstPTDate);
      if (daysToInitiate !== null && daysToInitiate >= 0) {
        replyToInitiateSum += daysToInitiate;
        replyToInitiateCount++;
      }
    });

    return {
      avgDaysConsultToReply: consultToReplyCount > 0 ? (consultToReplySum / consultToReplyCount).toFixed(1) : "無資料",
      avgDaysReplyToInitiate: replyToInitiateCount > 0 ? (replyToInitiateSum / replyToInitiateCount).toFixed(1) : "無資料",
      referralCount: consultToReplyCount,
      initiationCount: replyToInitiateCount,
    };
  }, [filteredPatients]);

  // 3. ICU Discharge and Stay Duration Analysis (轉出加護病房與停留天數分析)
  const icuStayStats = useMemo(() => {
    let totalStayDays = 0;
    let dischargedCount = 0;
    let maxStayDays = -1;
    let minStayDays = Infinity;
    
    let totalPTtoDischargeDays = 0;
    let ptToDischargeCount = 0;

    filteredPatients.forEach((p) => {
      if (p.icuDischargeDate) {
        const stayDays = getDaysBetween(p.consultDate, p.icuDischargeDate);
        if (stayDays !== null && stayDays >= 0) {
          totalStayDays += stayDays;
          dischargedCount++;
          if (stayDays > maxStayDays) maxStayDays = stayDays;
          if (stayDays < minStayDays) minStayDays = stayDays;
        }

        const ptStayDays = getDaysBetween(p.firstPTDate, p.icuDischargeDate);
        if (ptStayDays !== null && ptStayDays >= 0) {
          totalPTtoDischargeDays += ptStayDays;
          ptToDischargeCount++;
        }
      }
    });

    return {
      dischargedCount,
      avgStayDays: dischargedCount > 0 ? (totalStayDays / dischargedCount).toFixed(1) : "無資料",
      avgPTtoDischargeDays: ptToDischargeCount > 0 ? (totalPTtoDischargeDays / ptToDischargeCount).toFixed(1) : "無資料",
      maxStayDays: dischargedCount > 0 ? maxStayDays : "無資料",
      minStayDays: dischargedCount > 0 ? minStayDays : "無資料",
    };
  }, [filteredPatients]);

  // 4. Current Patient Mobility Scale level (體能活動等級分佈)
  // Usually calculated based on the latest logs of each patient in the current filter period (or active list)
  const mobilityLevelDistribution = useMemo(() => {
    const levelCounts: { [level: number]: number } = {};
    for (let i = 0; i <= 10; i++) {
      levelCounts[i] = 0;
    }

    // Get latest log level of each patient in the filtered logs
    const patientLatestLevel: { [patientId: string]: number } = {};
    const sortedLogsAsc = [...filteredLogs].sort((a, b) => a.date.localeCompare(b.date));
    sortedLogsAsc.forEach((log) => {
      patientLatestLevel[log.patientId] = log.mobilityLevel;
    });

    // Fill counts
    Object.values(patientLatestLevel).forEach((level) => {
      if (level >= 0 && level <= 10) {
        levelCounts[level]++;
      }
    });

    // Transform into Recharts format
    return Object.keys(levelCounts).map((lvlStr) => {
      const lvl = parseInt(lvlStr, 10);
      return {
        level: lvl,
        levelLabel: `級別 ${lvl}`,
        levelname: ICU_MOBILITY_LEVELS[lvl]?.name || `級別 ${lvl}`,
        人數: levelCounts[lvl],
        color: getMobilityBarColor(lvl),
      };
    });
  }, [filteredLogs]);

  // Calculates the overall average mobility level in the period
  const averageMobilityLevel = useMemo(() => {
    const intervenedLogs = filteredLogs.filter((log) => log.hasIntervention);
    if (intervenedLogs.length === 0) return "0.0";
    const sum = intervenedLogs.reduce((acc, log) => acc + log.mobilityLevel, 0);
    return (sum / intervenedLogs.length).toFixed(1);
  }, [filteredLogs]);

  // 4. Reasons for No Intervention (未介入原因統計)
  const noInterventionDistribution = useMemo(() => {
    const counts: { [reason: string]: number } = {};
    const unIntervenedLogs = filteredLogs.filter((log) => !log.hasIntervention);

    unIntervenedLogs.forEach((log) => {
      const reason = log.noInterventionReason || "未說明原因";
      counts[reason] = (counts[reason] || 0) + 1;
    });

    // Transform into list and sort descending
    return Object.keys(counts)
      .map((reason) => ({
        name: reason,
        value: counts[reason],
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  // Predefined color palette for reasons pie chart
  const PIE_COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6"];

  // 5. Monthly & Quarterly Reports statistical compilation (月度和季度統計報表數據)
  const monthlyStatsTable = useMemo(() => {
    const monthsGroup: { [month: string]: { logs: PTLog[]; patientIds: Set<string> } } = {};
    processedLogs.forEach((log) => {
      const m = getMonthFromDate(log.date);
      if (!monthsGroup[m]) {
        monthsGroup[m] = { logs: [], patientIds: new Set() };
      }
      monthsGroup[m].logs.push(log);
      monthsGroup[m].patientIds.add(log.patientId);
    });

    return Object.keys(monthsGroup)
      .sort((a, b) => b.localeCompare(a)) // Latest month on top
      .map((month) => {
        const { logs, patientIds } = monthsGroup[month];
        const totalLogs = logs.length;
        const intervenedLogs = logs.filter((l) => l.hasIntervention);
        const intervened = intervenedLogs.length;
        const execRate = totalLogs > 0 ? (intervened / totalLogs) * 100 : 0;
        const avgMobility = intervened > 0 ? intervenedLogs.reduce((acc, l) => acc + l.mobilityLevel, 0) / intervened : 0;

        // Find most frequent no intervention reason
        const reasons: { [r: string]: number } = {};
        logs.filter((l) => !l.hasIntervention).forEach((l) => {
          const r = l.noInterventionReason || "未知";
          reasons[r] = (reasons[r] || 0) + 1;
        });
        let topReason = "無";
        let maxCount = 0;
        Object.entries(reasons).forEach(([r, count]) => {
          if (count > maxCount) {
            maxCount = count;
            topReason = r;
          }
        });

        return {
          period: month,
          patientsCount: patientIds.size,
          logsCount: totalLogs,
          execRate: execRate.toFixed(1) + "%",
          avgMobility: avgMobility.toFixed(1),
          topReason: topReason + (maxCount > 0 ? ` (${maxCount} 次)` : ""),
        };
      });
  }, [processedLogs]);

  const quarterlyStatsTable = useMemo(() => {
    const quartersGroup: { [quarter: string]: { logs: PTLog[]; patientIds: Set<string> } } = {};
    processedLogs.forEach((log) => {
      const q = getQuarterFromDate(log.date);
      if (!quartersGroup[q]) {
        quartersGroup[q] = { logs: [], patientIds: new Set() };
      }
      quartersGroup[q].logs.push(log);
      quartersGroup[q].patientIds.add(log.patientId);
    });

    return Object.keys(quartersGroup)
      .sort((a, b) => b.localeCompare(a)) // Latest quarter on top
      .map((quarter) => {
        const { logs, patientIds } = quartersGroup[quarter];
        const totalLogs = logs.length;
        const intervenedLogs = logs.filter((l) => l.hasIntervention);
        const intervened = intervenedLogs.length;
        const execRate = totalLogs > 0 ? (intervened / totalLogs) * 100 : 0;
        const avgMobility = intervened > 0 ? intervenedLogs.reduce((acc, l) => acc + l.mobilityLevel, 0) / intervened : 0;

        // Top no intervention reason
        const reasons: { [r: string]: number } = {};
        logs.filter((l) => !l.hasIntervention).forEach((l) => {
          const r = l.noInterventionReason || "未知";
          reasons[r] = (reasons[r] || 0) + 1;
        });
        let topReason = "無";
        let maxCount = 0;
        Object.entries(reasons).forEach(([r, count]) => {
          if (count > maxCount) {
            maxCount = count;
            topReason = r;
          }
        });

        return {
          period: quarter,
          patientsCount: patientIds.size,
          logsCount: totalLogs,
          execRate: execRate.toFixed(1) + "%",
          avgMobility: avgMobility.toFixed(1),
          topReason: topReason + (maxCount > 0 ? ` (${maxCount} 次)` : ""),
        };
      });
  }, [processedLogs]);

  // 6. CSV Report Export function (包含 UTF-8 BOM 避免 Excel 亂碼)
  function handleExportStats(type: "monthly" | "quarterly" | "all-logs") {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = "";

    if (type === "monthly") {
      filename = `加護病房神經外科物理治療_月報表_${new Date().toISOString().substring(0, 10)}.csv`;
      headers = ["月份", "收案人數", "紀錄總人次", "物理治療介入執行率", "平均體能活動等級", "主要未介入原因"];
      rows = monthlyStatsTable.map((item) => [
        item.period,
        String(item.patientsCount),
        String(item.logsCount),
        item.execRate,
        item.avgMobility,
        item.topReason.replace(/,/g, "，"),
      ]);
    } else if (type === "quarterly") {
      filename = `加護病房神經外科物理治療_季報表_${new Date().toISOString().substring(0, 10)}.csv`;
      headers = ["季度", "收案人數", "紀錄總人次", "物理治療介入執行率", "平均體能活動等級", "主要未介入原因"];
      rows = quarterlyStatsTable.map((item) => [
        item.period,
        String(item.patientsCount),
        String(item.logsCount),
        item.execRate,
        item.avgMobility,
        item.topReason.replace(/,/g, "，"),
      ]);
    } else if (type === "all-logs") {
      filename = `加護病房神經外科物理治療_完整紀錄匯出_${new Date().toISOString().substring(0, 10)}.csv`;
      headers = [
        "紀錄日期",
        "床號",
        "病歷號碼",
        "姓名",
        "診斷說明",
        "入ICU日期",
        "收案照會日期",
        "回覆照會日期",
        "第一次介入日期",
        "轉出加護病房日期",
        "停留ICU天數",
        "ICU住院累計天數",
        "當天是否有治療介入",
        "未介入原因",
        "目前體能活動等級(ICU Mobility Scale)",
        "體能活動等級名稱",
        "RASS躁動鎮靜強度分數",
        "GCS睜眼反應(E)",
        "GCS語言反應(V)",
        "GCS運動反應(M)",
        "GCS總評分",
        "GCS嚴重分級",
        "最大吸氣壓(MIP, cmH₂O)",
        "備註",
      ];
      rows = filteredLogs.map((log) => {
        const patient = patients.find((p) => p.id === log.patientId);
        const icuStay = patient ? getDaysBetween(patient.consultDate, patient.icuDischargeDate) : null;
        const hospStay = patient ? getDaysBetween(patient.icuAdmissionDate || (patient as any).admissionDate, patient.icuDischargeDate) : null;
        return [
          log.date,
          log.bedValue || patient?.bedValue || "",
          patient ? (isAdmin ? patient.chartNo : "******") : "",
          patient?.name || "",
          (patient?.diagnosis || "").replace(/,/g, "，"),
          patient ? (patient.icuAdmissionDate || (patient as any).admissionDate || "") : "",
          patient?.consultDate || "",
          patient?.replyDate || "",
          patient?.firstPTDate || "",
          patient?.icuDischargeDate || "",
          icuStay !== null ? String(icuStay) : "",
          hospStay !== null ? String(hospStay) : "",
          log.hasIntervention ? "是" : "否",
          (log.noInterventionReason || "無").replace(/,/g, "，"),
          String(log.mobilityLevel),
          ICU_MOBILITY_LEVELS[log.mobilityLevel]?.name || "",
          log.rassScore != null ? String(log.rassScore) : "",
          log.gcsEye != null ? String(log.gcsEye) : "",
          log.gcsVerbal != null ? String(log.gcsVerbal) : "",
          log.gcsMotor != null ? String(log.gcsMotor) : "",
          log.gcsTotal != null ? String(log.gcsTotal) : "",
          log.gcsTotal != null ? (getGcsSeverity(log.gcsTotal)?.name || "") : "",
          log.maxInspiratoryPressure != null ? String(log.maxInspiratoryPressure) : "",
          (log.notes || "無").replace(/,/g, "，").replace(/\n/g, " "),
        ];
      });
    }

    // Construct the CSV content with UTF-8 BOM
    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.map((cell) => `"${cell || ""}"`).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Search & Filters Bento Box */}
      <div id="filter-bento" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">時間區間篩選</h3>
              <p className="text-xs text-slate-500">針對照會及每日記錄進行時間劃分與交叉分析</p>
            </div>
          </div>

          {/* Quick Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                filterType === "all"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              全部時間
            </button>
            <button
              onClick={() => setFilterType("year")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                filterType === "year"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              按年份
            </button>
            <button
              onClick={() => setFilterType("month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                filterType === "month"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              按月份
            </button>
            <button
              onClick={() => setFilterType("custom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                filterType === "custom"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              自訂區間
            </button>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold ring-1 ring-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer transition-all flex items-center justify-center gap-1.5 ml-0 md:ml-2 shadow-sm"
              title="將儀表板完整臨床統計數據與收案名單輸出為 PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              匯出 PDF 報表
            </button>
          </div>
        </div>

        {/* Dynamic Filter Inputs */}
        {filterType !== "all" && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
            {filterType === "year" && (
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="year-select">選擇年份</label>
                <select
                  id="year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 outline-none"
                >
                  <option value="2026">2026 年</option>
                  <option value="2025">2025 年</option>
                  <option value="2024">2024 年</option>
                </select>
              </div>
            )}

            {filterType === "month" && (
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="month-select">選擇月份</label>
                <input
                  id="month-select"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 outline-none"
                />
              </div>
            )}

            {filterType === "custom" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="start-date-input">啟始日期</label>
                  <input
                    id="start-date-input"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="end-date-input">截止日期</label>
                  <input
                    id="end-date-input"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 outline-none"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Individual Patient Search & Overall Mobility Level Filter Row */}
        <div className="mt-4 pt-4 border-t border-slate-150 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Patient Selector Bento */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-600" />
              <label className="text-xs font-bold text-slate-700 block">
                個案檢索與單一儀表板查詢
              </label>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="輸入姓名、床號、病歷號篩選下拉清單..."
                value={dashboardSearchQuery}
                onChange={(e) => setDashboardSearchQuery(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-850 outline-none focus:ring-1 focus:ring-teal-500"
              />
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white text-slate-800 outline-none cursor-pointer focus:ring-1 focus:ring-teal-500"
              >
                <option value="all">📊 顯示全體個案合併統計</option>
                {filteredPatientDropdownList.map((p) => (
                  <option key={p.id} value={p.id}>
                    【{p.bedValue}床】{p.name} ({isAdmin ? p.chartNo : "******"})
                  </option>
                ))}
              </select>
            </div>
            {selectedPatientObj && (
              <div className="p-2.5 bg-teal-50/70 border border-teal-100 rounded-md flex items-center justify-between text-[11px] text-teal-800 animate-fadeIn">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>💡 正在觀察【{selectedPatientObj.bedValue}床】{selectedPatientObj.name} 的專屬臨床歷程（住院/ICU天數分析）</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedPatientId("all");
                    setDashboardSearchQuery("");
                  }}
                  className="px-2 py-0.5 bg-white text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100 text-[10px] rounded font-semibold transition-all cursor-pointer"
                >
                  清除單一篩選
                </button>
              </div>
            )}
          </div>

          {/* Mobility Level Selector Bento */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-teal-600" />
              <label className="text-xs font-bold text-slate-700 block">
                整體個案各體能活動等級篩選
              </label>
            </div>
            <div className="space-y-2 lg:pt-1">
              <select
                value={selectedMobilityLevel}
                onChange={(e) => setSelectedMobilityLevel(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white text-slate-800 outline-none cursor-pointer focus:ring-1 focus:ring-teal-500"
              >
                <option value="all">📶 顯示所有體能活動等級 (0 至 10 級)</option>
                {Object.entries(ICU_MOBILITY_LEVELS).map(([level, info]) => (
                  <option key={level} value={level}>
                    等級 {level}：{info.name} — ({info.definition})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">
                臨床解讀：選定單一等級後，系統將精準篩選該體能活動基準下之指標、月報、季報與個案歷史明細。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metric Overview Grid */}
      <div id="kpi-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: PT Intervention Execution Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium tracking-wide">復健介入執行率</span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-teal-600">{executionStats.rate}%</span>
            </div>
            <p className="text-[11px] text-slate-400">
              篩選期：已介入 {executionStats.intervened} / 總記錄 {executionStats.total}
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Average ICU Mobility Level */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium tracking-wide">平均體能活動等級</span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-800">{averageMobilityLevel}</span>
              <span className="text-xs text-slate-400">/ 10 級</span>
            </div>
            <p className="text-[11px] text-slate-400">全體病患在選定期間等級均值</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Average Consult-to-Reply Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium tracking-wide">平均照會回覆天數</span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-indigo-600">
                {referralSpeeds.avgDaysConsultToReply}
              </span>
              {typeof referralSpeeds.avgDaysConsultToReply === "string" && !isNaN(Number(referralSpeeds.avgDaysConsultToReply)) && (
                <span className="text-xs text-slate-400">天</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">照會日至醫師/物理治療師回覆間隔</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Average Reply-to-Initiate Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium tracking-wide">平均回覆至開案治療</span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-blue-600">
                {referralSpeeds.avgDaysReplyToInitiate}
              </span>
              {typeof referralSpeeds.avgDaysReplyToInitiate === "string" && !isNaN(Number(referralSpeeds.avgDaysReplyToInitiate)) && (
                <span className="text-xs text-slate-400">天</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">回覆照會後至第一次介入天數</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-1000 shrink-0">
            <BriefcaseMedical className="w-6 h-6 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ICU stay and discharge statistics section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 animate-fadeIn">
        <div>
          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-rose-500" />
            加護病房 (ICU) 轉出與停留天數追蹤
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">統計已設定「轉出加護病房日期」之結案個案在加護病房的時間與治療介入時程</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400 font-bold block">已轉出/結案總人數</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-2xl font-extrabold text-rose-600">{icuStayStats.dischargedCount}</span>
              <span className="text-xs text-slate-450 font-sans ml-0.5">人</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400 font-bold block font-sans">平均 ICU 停留天數 (照會➔轉出)</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-2xl font-extrabold text-slate-800">{icuStayStats.avgStayDays}</span>
              {icuStayStats.dischargedCount > 0 && <span className="text-xs text-slate-450 font-sans ml-0.5">天</span>}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400 font-bold block font-sans">平均物理治療介入至轉出</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-2xl font-extrabold text-teal-600">{icuStayStats.avgPTtoDischargeDays}</span>
              {icuStayStats.dischargedCount > 0 && <span className="text-xs text-slate-450 font-sans ml-0.5">天</span>}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-150 p-4 rounded-lg space-y-1">
            <span className="text-[11px] text-slate-400 font-bold block font-sans">ICU停留天數極端值 (最短 / 最長)</span>
            <div className="flex items-baseline gap-1.5 mt-1 font-mono">
              <span className="text-sm font-extrabold text-slate-600">{icuStayStats.minStayDays === "無資料" ? "-" : icuStayStats.minStayDays + "天"}</span>
              <span className="text-slate-300 text-xs">/</span>
              <span className="text-sm font-extrabold text-rose-600">{icuStayStats.maxStayDays === "無資料" ? "-" : icuStayStats.maxStayDays + "天"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div id="charts-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Mobility Level Distribution (8 columns) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-teal-600" />
              目前體能活動量等級分佈數量 (ICU Mobility Scale)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">反映在選定篩選期間，全病房病患最新狀態之等級統計人次分佈</p>
          </div>

          <div className="h-[300px] w-full">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 stroke-1" />
                <span className="text-xs">此篩選區間內目前無資料，無法繪製統計圖表</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mobilityLevelDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="levelLabel" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                    formatter={(value: any, name: any, props: any) => [
                      `${value} 人 (${props.payload.levelname})`,
                      "分佈人數",
                    ]}
                  />
                  <Bar dataKey="人數" radius={[4, 4, 0, 0]}>
                    {mobilityLevelDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Reasons for No Intervention (5 columns) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-teal-600" />
              未進行介入原因(統計人次佔比)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">分析未執行床邊復健之臨床主因，以提供院內品質優化依據</p>
          </div>

          <div className="h-[200px] w-full relative flex items-center justify-center">
            {noInterventionDistribution.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 stroke-1" />
                <span className="text-xs">本時段內所有病患皆有如期介入，無未介入案例。</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={noInterventionDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={false}
                  >
                    {noInterventionDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie Chart Legend List */}
          {noInterventionDistribution.length > 0 && (
            <div className="mt-2 space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
              {noInterventionDistribution.slice(0, 5).map((entry, index) => {
                const total = noInterventionDistribution.reduce((acc, curr) => acc + curr.value, 0);
                const percent = Math.round((entry.value / total) * 100);
                return (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate max-w-[80%]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      ></span>
                      <span className="text-slate-600 truncate text-[11px]">{entry.name}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] shrink-0">
                      {entry.value}次 ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reports Export & Monthly/Quarterly Statistical Tables Section */}
      <div id="reports-tables-container" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Statistical Table Block */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              每月績效指標與執行統計表
            </h4>
            <button
              onClick={() => handleExportStats("monthly")}
              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 cursor-pointer flex items-center gap-1 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              匯出月報
            </button>
          </div>

          <div className="overflow-x-auto min-h-[150px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-[11px] font-semibold uppercase bg-slate-50">
                  <th className="py-2.5 px-3">月份</th>
                  <th className="py-2.5 px-3 text-center">收案</th>
                  <th className="py-2.5 px-3 text-center">評估人次</th>
                  <th className="py-2.5 px-3 text-center">接入率</th>
                  <th className="py-2.5 px-3 text-center">平均等級</th>
                  <th className="py-2.5 px-3">核心原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {monthlyStatsTable.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">目前尚無歷史月度數據</td>
                  </tr>
                ) : (
                  monthlyStatsTable.slice(0, 6).map((r) => (
                    <tr key={r.period} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-700">{r.period}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{r.patientsCount} 人</td>
                      <td className="py-2 px-3 text-center text-slate-600">{r.logsCount} 次</td>
                      <td className="py-2 px-3 text-center text-teal-600 font-bold">{r.execRate}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">{r.avgMobility}</td>
                      <td className="py-2 px-3 text-slate-400 max-w-[130px] truncate" title={r.topReason}>
                        {r.topReason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quarterly Statistical Table Block */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-teal-600" />
              每季目標管理與統計報表
            </h4>
            <button
              onClick={() => handleExportStats("quarterly")}
              className="px-2.5 py-1 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg border border-teal-200 cursor-pointer flex items-center gap-1 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              匯出季報
            </button>
          </div>

          <div className="overflow-x-auto min-h-[150px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-[11px] font-semibold uppercase bg-slate-50">
                  <th className="py-2.5 px-3">季度</th>
                  <th className="py-2.5 px-3 text-center">收案</th>
                  <th className="py-2.5 px-3 text-center">評估人次</th>
                  <th className="py-2.5 px-3 text-center">接入率</th>
                  <th className="py-2.5 px-3 text-center">平均等級</th>
                  <th className="py-2.5 px-3">核心原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {quarterlyStatsTable.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">目前尚無歷史季度數據</td>
                  </tr>
                ) : (
                  quarterlyStatsTable.map((r) => (
                    <tr key={r.period} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-700">{r.period}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{r.patientsCount} 人</td>
                      <td className="py-2 px-3 text-center text-slate-600">{r.logsCount} 次</td>
                      <td className="py-2 px-3 text-center text-teal-600 font-bold">{r.execRate}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">{r.avgMobility}</td>
                      <td className="py-2 px-3 text-slate-400 max-w-[130px] truncate" title={r.topReason}>
                        {r.topReason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Full Records Export Helper */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400">
            <FileOutput className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-sm tracking-wide">原始資料庫全面匯出 CSV</h4>
            <p className="text-xs text-slate-400 mt-1">
              支援一次性導出全病房病歷、日期、床號及每日日誌明細，便於主管與醫療團隊進一步進行統計與分析。
            </p>
          </div>
        </div>
        <button
          onClick={() => handleExportStats("all-logs")}
          className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          下載完整執行紀錄報表
        </button>
      </div>

      {/* Guide details about Mobility Scale */}
      <div id="mobility-guide-footer" className="bg-slate-50 rounded-xl border border-slate-200 p-4 shrink-0 flex gap-2.5 items-start">
        <Info className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h5 className="text-xs font-bold text-slate-700">ICU 體能活動等級標準指引</h5>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            系統中採用的體能活動量等級依據 <span className="font-bold text-slate-700">ICU Mobility Scale</span> 核心標準，
            定義包括：0級完全臥床（無主動出力）、1級床上活動（主動翻身/拱橋）、2級被動下床（用移植機坐椅）、
            3級床邊坐起、4級站立（雙腳承重）、5級轉位至椅、6級原地踏步（床邊踏步&gt;=4次）、7-10級為不同支持下之行走指標。
          </p>
        </div>
      </div>

      {/* ========================================================== */}
      {/* CLINICAL REPORT PRINT OUT (PRINT-ONLY LAYOUT FOR PDF)       */}
      {/* ========================================================== */}
      <div className="print-only hidden pt-6 p-4 space-y-6 font-sans text-xs bg-white text-black leading-relaxed">
        {/* Report Title Header */}
        <div className="border-b-2 border-slate-900 pb-4 text-center">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">加護病房神經外科物理治療復健品質與績效統計報表</h2>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">ICU Neurosurgery Physical Therapy Quality Ledger & Efficacy Audit Report</p>
          <div className="flex justify-between items-center text-[10px] text-slate-500 mt-4 leading-none">
            <span>製表日期：{new Date().toLocaleDateString('zh-TW')}</span>
            <span>篩選時間區間：{filterType === "all" ? "全部時間" : filterType === "year" ? `${selectedYear} 年` : filterType === "month" ? `${selectedMonth}` : `自訂區間 (${startDate || "起始"} 至 ${endDate || "結束"})`}</span>
            <span>列印人員：臨床專業物理治療團隊</span>
          </div>
        </div>

        {/* Part 1: KPI Statistics Overview */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide border-l-2 border-slate-950 pl-1.5">一、核心指標與醫療品質摘要</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">收案病患人數 (個案統計)</span>
              <span className="text-base font-extrabold text-slate-900 mt-1 block">{filteredPatients.length} <span className="text-xs font-normal text-slate-500">人</span></span>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">評估與評分日 (記錄人次)</span>
              <span className="text-base font-extrabold text-slate-900 mt-1 block">{filteredLogs.length} <span className="text-xs font-normal text-slate-500">人次</span></span>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">物理治療核心介入率</span>
              <span className="text-base font-extrabold text-slate-900 mt-1 block">
                {filteredLogs.length > 0 
                  ? ((filteredLogs.filter(l => l.hasIntervention).length / filteredLogs.length) * 100).toFixed(1) 
                  : "0"}%
              </span>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">轉出加護病房結案人數</span>
              <span className="text-base font-extrabold text-slate-905 mt-1 block">{icuStayStats.dischargedCount} <span className="text-xs font-normal text-slate-500">人</span></span>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">平均 ICU 停留天數</span>
              <span className="text-base font-extrabold text-slate-900 mt-1 block">{icuStayStats.avgStayDays} <span className="text-xs font-normal text-slate-500">天</span></span>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <span className="text-[10px] text-slate-500 font-bold block">平均物理治療至出加護病房</span>
              <span className="text-base font-extrabold text-teal-800 mt-1 block">{icuStayStats.avgPTtoDischargeDays} <span className="text-xs font-normal text-slate-500">天</span></span>
            </div>
          </div>
        </div>

        {/* Part 2: Monthly performance indicators */}
        <div className="space-y-2 print-avoid-break">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide border-l-2 border-slate-950 pl-1.5">二、每月績效指標與執行率統計表</h3>
          <table className="w-full text-left border-collapse border border-slate-400 text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-400">
                <th className="py-1.5 px-2 border-r border-slate-400 font-bold">月份</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">收案人數</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">每日紀錄人次</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">物理治療介入率</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">平均體能等級(ICU Mobility Scale)</th>
                <th className="py-1.5 px-2 font-bold">核心未加入原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 bg-white">
              {monthlyStatsTable.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">尚無歷史月度數據</td>
                </tr>
              ) : (
                monthlyStatsTable.map((item) => (
                  <tr key={item.period} className="border-b border-slate-300">
                    <td className="py-1.5 px-2 border-r border-slate-300 font-semibold">{item.period}</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center">{item.patientsCount} 人</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center">{item.logsCount} 次</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center font-bold">{item.execRate}</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono">{item.avgMobility}</td>
                    <td className="py-1.5 px-2 text-slate-600">{item.topReason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Part 3: Quarterly stats table */}
        <div className="space-y-2 print-avoid-break">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide border-l-2 border-slate-950 pl-1.5">三、每季目標管理與品質指標統計報表</h3>
          <table className="w-full text-left border-collapse border border-slate-400 text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-400">
                <th className="py-1.5 px-2 border-r border-slate-400 font-bold">季度</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">收案人數</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">每日紀錄人次</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">物理治療介入率</th>
                <th className="py-1.5 px-2 border-r border-slate-400 text-center font-bold">平均體能等級(ICU Mobility Scale)</th>
                <th className="py-1.5 px-2 font-bold">主要未介入原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 bg-white">
              {quarterlyStatsTable.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">目前尚無歷史季度數據</td>
                </tr>
              ) : (
                quarterlyStatsTable.map((item) => (
                  <tr key={item.period} className="border-b border-slate-300">
                    <td className="py-1.5 px-2 border-r border-slate-300 font-semibold">{item.period}</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center">{item.patientsCount} 人</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center">{item.logsCount} 次</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center font-bold">{item.execRate}</td>
                    <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono">{item.avgMobility}</td>
                    <td className="py-1.5 px-2 text-slate-600">{item.topReason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Part 4: Clinical Patient Registry Details */}
        <div className="space-y-2 print-avoid-break">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide border-l-2 border-slate-950 pl-1.5">四、加護病房物理治療收案個案追蹤名冊 (入ICU日與停留天數分析)</h3>
          <table className="w-full text-left border-collapse border border-slate-400 text-[9px]">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-400">
                <th className="py-1 px-1.5 border-r border-slate-400 text-center font-bold">床號</th>
                <th className="py-1 px-1.5 border-r border-slate-400 font-bold">姓名</th>
                <th className="py-1 px-1.5 border-r border-slate-400 font-bold">病歷號</th>
                <th className="py-1 px-1.5 border-r border-slate-400 font-bold">診斷說明</th>
                <th className="py-1 px-1.5 border-r border-slate-400 text-center font-bold">入ICU日期</th>
                <th className="py-1 px-1.5 border-r border-slate-400 text-center font-bold">照會日期</th>
                <th className="py-1 px-1.5 border-r border-slate-400 text-center font-bold">介入日期</th>
                <th className="py-1 px-1.5 border-r border-slate-400 text-center font-bold">加護轉出</th>
                <th className="py-1 px-1.5 text-center font-bold">ICU 停留 / ICU 住院</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 bg-white">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-3 text-center text-slate-400">無符合當前篩選條件之收案名單</td>
                </tr>
              ) : (
                filteredPatients.map((pat) => {
                  const icuDays = getDaysBetween(pat.consultDate, pat.icuDischargeDate);
                  const hospDays = getDaysBetween(pat.icuAdmissionDate || (pat as any).admissionDate, pat.icuDischargeDate);
                  return (
                    <tr key={pat.id} className="border-b border-slate-300">
                      <td className="py-1 px-1.5 border-r border-slate-300 text-center font-semibold font-mono">{pat.bedValue}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 font-bold">{pat.name}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 font-mono">{isAdmin ? pat.chartNo : "******"}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 text-slate-700 max-w-[125px] truncate" title={pat.diagnosis}>{pat.diagnosis}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 text-center font-mono">{pat.icuAdmissionDate || (pat as any).admissionDate || "-"}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 text-center font-mono">{pat.consultDate || "-"}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 text-center font-mono">{pat.firstPTDate || "-"}</td>
                      <td className="py-1 px-1.5 border-r border-slate-300 text-center font-mono">{pat.icuDischargeDate || "加護中/未轉出"}</td>
                      <td className="py-1 px-1.5 text-center font-mono">
                        <span className="text-rose-600 font-bold">{icuDays !== null ? `${icuDays}天` : "-"}</span>
                        {" / "}
                        <span className="text-blue-600 font-bold">{hospDays !== null ? `${hospDays}天` : "-"}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Part 5: Signature block */}
        <div className="pt-8 border-t border-dashed border-slate-400 print-avoid-break">
          <div className="grid grid-cols-3 gap-8 text-center text-[10px] text-slate-800">
            <div className="space-y-12">
              <p>專業物理治療主管核章 (Rehab Supervisor)</p>
              <div className="border-t border-slate-400 w-40 mx-auto pt-1 font-mono text-slate-450">簽章日期：    年    月    日</div>
            </div>
            <div className="space-y-12">
              <p>神經外科 ICU 主任核簽 (NS ICU Director)</p>
              <div className="border-t border-slate-400 w-40 mx-auto pt-1 font-mono text-slate-450">簽章日期：    年    月    日</div>
            </div>
            <div className="space-y-12">
              <p>復健科部醫療總監核章 (Department Director)</p>
              <div className="border-t border-slate-400 w-40 mx-auto pt-1 font-mono text-slate-450">簽章日期：    年    月    日</div>
            </div>
          </div>
          <div className="text-center text-[9px] text-slate-400 mt-8">
            * 本統計報表為臨床品管與績效統計專用審查依據，資料來源經系統安全核簽及稽核。 (Confidential Quality Assurance document)
          </div>
        </div>
      </div>
    </div>
  );
}
