import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, onSnapshot, getDocs, doc, deleteDoc, setDoc, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { Patient, PTLog, ICU_MOBILITY_LEVELS } from "./types";
import { sha256, generateSalt, getDaysBetween } from "./utils";
import StatisticsDashboard from "./components/StatisticsDashboard";
import PatientDetailView from "./components/PatientDetailView";
import AdminVerification from "./components/AdminVerification";
import EditPatientModal from "./components/EditPatientModal";
import {
  ShieldCheck,
  ShieldAlert,
  FolderLock,
  Plus,
  Search,
  UserCheck,
  BriefcaseMedical,
  Users,
  Activity,
  LogOut,
  RefreshCw,
  NotebookTabs,
  Trash2,
  Edit2,
  CalendarDays,
  LockKeyhole,
  CheckCircle,
  HelpCircle
} from "lucide-react";

export default function App() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allLogs, setAllLogs] = useState<{ [patientId: string]: PTLog[] }>({});
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // Selected Patient for detailed tracing history view
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Administrative Authority States
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminVerify, setShowAdminVerify] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // Admin Change Password helper states
  const [showPassChange, setShowPassChange] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");

  // Primary Workspace tab state
  const [activeTab, setActiveTab] = useState<"dashboard" | "patients">("dashboard");

  // Search Filter state
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * Listen to Patients Collection (Reactive stream)
   */
  useEffect(() => {
    setLoading(true);
    const patientsCollection = collection(db, "patients");

    const unsubscribe = onSnapshot(
      patientsCollection,
      (snapshot) => {
        const patientList: Patient[] = [];
        snapshot.forEach((doc) => {
          patientList.push({
            id: doc.id,
            ...doc.data(),
          } as Patient);
        });

        // Sort by bedValue code ascending
        patientList.sort((a, b) => {
          return a.bedValue.localeCompare(b.bedValue, "zh-Hant", { numeric: true });
        });

        setPatients(patientList);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "patients");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Load Logs for Patients on-demand when patient list updates
   */
  const fetchAllLogs = useCallback(async (patientList: Patient[]) => {
    if (patientList.length === 0) return;
    setLogsLoading(true);
    try {
      const logsDict: { [patientId: string]: PTLog[] } = {};

      await Promise.all(
        patientList.map(async (pat) => {
          const logsSnap = await getDocs(collection(db, "patients", pat.id, "logs"));
          const logsList: PTLog[] = [];
          logsSnap.forEach((doc) => {
            logsList.push({
              id: doc.id,
              ...doc.data(),
            } as PTLog);
          });
          logsDict[pat.id] = logsList;
        })
      );

      setAllLogs(logsDict);
    } catch (err) {
      console.error("Error loading logs:", err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Sync logs when patients are fetched or refreshed
  useEffect(() => {
    if (patients.length > 0) {
      fetchAllLogs(patients);
    }
  }, [patients, fetchAllLogs]);

  // Find currently selected patient in list
  const selectedPatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  // Filters patients list by name, bed, or chart number search query
  const filteredPatientsList = useMemo(() => {
    if (!searchQuery.trim()) return patients;
    const query = searchQuery.toLowerCase().trim();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.bedValue.toLowerCase().includes(query) ||
        p.chartNo.toLowerCase().includes(query) ||
        p.diagnosis.toLowerCase().includes(query)
    );
  }, [patients, searchQuery]);

  /**
   * Delete Patient Profile with logs cleanup
   */
  async function handleDeletePatient(patientId: string) {
    if (!window.confirm("確定要將此病患結案並進行刪除？這樣會連同該個案所有復健與體能評估記錄一併永久清除！")) {
      return;
    }

    try {
      // 1. Delete all subcollection daily logs
      const subLogsSnap = await getDocs(collection(db, "patients", patientId, "logs"));
      const deletePromises: Promise<void>[] = [];
      subLogsSnap.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      await Promise.all(deletePromises);

      // 2. Delete parent patient document
      await deleteDoc(doc(db, "patients", patientId));

      if (selectedPatientId === patientId) {
        setSelectedPatientId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `patients/${patientId}`);
      alert("刪除病患資料發生錯誤，請重試。");
    }
  }

  /**
   * Handle Password Change
   */
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");

    if (!newPassword || newPassword.length < 6) {
      setPassError("新密碼必須至少為 6 個字元。");
      return;
    }

    try {
      const configDocRef = doc(db, "config", "admin");
      const docSnap = await getDoc(configDocRef);
      if (!docSnap.exists()) {
        setPassError("系統尚未初始化，請重新整理頁面。");
        return;
      }

      const data = docSnap.data();
      const storedHash = data.passwordHash;
      const storedSalt = data.salt;

      const oldCombined = oldPassword + storedSalt;
      const oldInputHash = await sha256(oldCombined);

      if (oldInputHash !== storedHash) {
        setPassError("目前舊密碼輸入錯誤，無法更變主管密碼！");
        return;
      }

      const newSalt = generateSalt();
      const newCombined = newPassword + newSalt;
      const newHash = await sha256(newCombined);

      await setDoc(configDocRef, {
        passwordHash: newHash,
        salt: newSalt,
        updatedAt: Date.now(),
      });

      setPassSuccess("安全密碼更變成功！");
      setOldPassword("");
      setNewPassword("");
      setTimeout(() => {
        setShowPassChange(false);
        setPassSuccess("");
      }, 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "config/admin");
      setPassError("密碼更新失敗，請重新嘗試。");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-all duration-300">
      
      {/* Top Main Navigation Header Bar */}
      <header className="bg-slate-900 text-white shadow-md select-none shrink-0 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          
          {/* Logo Brand Description */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <BriefcaseMedical className="w-5.5 h-5.5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-slate-100 flex items-center gap-2">
                加護病房神經外科物理治療統計系統
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">NEUROSURGERY ICU PHYSICAL THERAPY TRACKING SYSTEM</p>
            </div>
          </div>

          {/* Quick Date Indicator and Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 font-mono bg-slate-800/60 border border-slate-700 px-2.5 py-1 rounded-md">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              <span>西元 2026年5月30日</span>
            </div>

            {/* Admin Key Lock Trigger Toggle */}
            {isAdmin ? (
              <div className="flex items-center gap-1 text-xs">
                {/* Admin configuration password reset option */}
                <button
                  onClick={() => setShowPassChange(!showPassChange)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-semibold cursor-pointer text-[11px] transition-colors"
                >
                  安全設置
                </button>
                <button
                  onClick={() => {
                    setIsAdmin(false);
                    setSelectedPatientId(null);
                    setShowPassChange(false);
                  }}
                  className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded font-bold cursor-pointer inline-flex items-center gap-1 border border-teal-500 shadow-sm transition-all"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>管理權限 (登出)</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowAdminVerify(true);
                  setSelectedPatientId(null);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded border border-slate-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FolderLock className="w-3.5 h-3.5" />
                <span>管理者登入</span>
              </button>
            )}
            
            {/* Quick refresh indicator */}
            <button
              onClick={() => fetchAllLogs(patients)}
              className={`p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded transition-colors cursor-pointer ${
                logsLoading ? "animate-spin" : ""
              }`}
              title="重新同步床邊紀錄"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Admin Change Password UI Form Widget Drawer */}
      {isAdmin && showPassChange && (
        <div className="bg-slate-800 border-b border-slate-700 text-white py-4 px-6 animate-fadeIn">
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold tracking-wider text-teal-400 flex items-center gap-1">
                <LockKeyhole className="w-4 h-4" />
                變更管理者安全防護密碼
              </h5>
              <button onClick={() => setShowPassChange(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {passError && <p className="text-[11px] p-2 bg-rose-500/20 border border-rose-500 rounded text-rose-300">{passError}</p>}
            {passSuccess && <p className="text-[11px] p-2 bg-emerald-500/20 border border-emerald-500 rounded text-emerald-300 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 shrink-0" /> {passSuccess}</p>}

            <form onSubmit={handlePasswordChange} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <input
                type="password"
                placeholder="目前舊密碼"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="p-1 px-2 border border-slate-600 rounded bg-slate-900 text-white outline-none"
                required
              />
              <input
                type="password"
                placeholder="欲設定之新密碼 (>= 6字) "
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="p-1 px-2 border border-slate-600 rounded bg-slate-900 text-white outline-none"
                required
              />
              <button
                type="submit"
                className="sm:col-span-2 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded cursor-pointer transition-colors"
              >
                確變動保管密碼
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Workspace Frame container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        
        {/* Verification View Overrides */}
        {showAdminVerify ? (
          <AdminVerification
            onVerifySuccess={() => {
              setIsAdmin(true);
              setShowAdminVerify(false);
              setActiveTab("patients");
            }}
            onCancel={() => {
              setShowAdminVerify(false);
            }}
          />
        ) : selectedPatientId && selectedPatient ? (
          
          /* Single Patient detailed logs and chart progression history view */
          <PatientDetailView
            patient={selectedPatient}
            logs={allLogs[selectedPatientId] || []}
            isAdmin={isAdmin}
            onBack={() => {
              setSelectedPatientId(null);
            }}
            onRefreshLogs={() => {
              fetchAllLogs(patients);
            }}
          />
        ) : (
          /* Central Tab navigation Workspace */
          <div className="space-y-5 animate-fadeIn">
            
            {/* Primary Navigation Workspaces tab indicators */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`py-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "dashboard"
                    ? "border-teal-600 text-teal-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <Activity className="w-4.5 h-4.5 text-teal-500" />
                <span>📊 物理治療介入指標儀表板</span>
              </button>
              
              <button
                onClick={() => setActiveTab("patients")}
                className={`py-3 px-5 text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "patients"
                    ? "border-teal-600 text-teal-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <Users className="w-4.5 h-4.5 text-teal-500" />
                <span>👥 ICU收案個案追蹤與管理</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold">
                  {patients.length} 個案
                </span>
              </button>
            </div>

            {/* Tab 1: Indicators Visualizations Dashboard */}
            {activeTab === "dashboard" && (
              <StatisticsDashboard patients={patients} allLogs={allLogs} isAdmin={isAdmin} />
            )}

            {/* Tab 2: Patients Management and Daily assessments list */}
            {activeTab === "patients" && (
              <div className="space-y-4">
                
                {/* Search Bar and Addition buttons */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  
                  {/* Search query input */}
                  <div className="relative w-full sm:max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4.5 h-4.5" />
                    </div>
                    <input
                      type="text"
                      placeholder="關鍵字搜尋收案病患 (例：床號、病歷號碼、姓名、診斷)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                    />
                  </div>

                  {/* Add Patient if admin authenticated */}
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        setEditingPatient(null);
                        setShowEditPatientModal(true);
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      新增收案個案
                    </button>
                  ) : (
                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-md">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>主管登入後可進行「個案增刪」及「日誌維護」</span>
                    </div>
                  )}
                </div>

                {/* Patient List Grid Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-250 text-slate-400 text-[11px] font-bold uppercase bg-slate-50/50">
                          <th className="py-3 px-4 text-center">床號</th>
                          <th className="py-3 px-4">姓名</th>
                          <th className="py-3 px-4">病歷號碼</th>
                          <th className="py-3 px-4">診斷說明</th>
                          <th className="py-3 px-4">照會里程日期 (照會/回覆/開案)</th>
                          <th className="py-3 px-4 text-center">最新體能級數</th>
                          <th className="py-3 px-4 text-center">歷史記錄人次</th>
                          <th className="py-3 px-4 text-center">管理動作</th>
                        </tr>
                      </thead>
                      
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {loading ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                              正在加載神經外科病患追蹤名單中...
                            </td>
                          </tr>
                        ) : filteredPatientsList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                              {searchQuery ? "找不到符合關鍵字的個案，請換個詞再試。" : "目前加護病房無追蹤名單，請登入管理者新增收案個案。"}
                            </td>
                          </tr>
                        ) : (
                          filteredPatientsList.map((pat) => {
                            const patLogs = allLogs[pat.id] || [];
                            const patLogsCount = patLogs.length;
                            
                            // Calculate current level
                            let latestLog: PTLog | null = null;
                            if (patLogsCount > 0) {
                              const intervenedLogs = [...patLogs].filter(l => l.hasIntervention);
                              if (intervenedLogs.length > 0) {
                                latestLog = intervenedLogs.sort((a, b) => b.date.localeCompare(a.date))[0];
                              }
                            }
                            
                            const levelInfo = latestLog ? ICU_MOBILITY_LEVELS[latestLog.mobilityLevel] : null;

                            return (
                              <tr key={pat.id} className="hover:bg-slate-50/40">
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-800 font-mono font-extrabold text-[11px] rounded">
                                    {pat.bedValue}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">
                                  {pat.name}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                                  {isAdmin ? pat.chartNo : "******"}
                                </td>
                                <td className="py-3 px-4 max-w-[200px] truncate text-slate-600" title={pat.diagnosis}>
                                  {pat.diagnosis}
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5 text-[11px] font-mono text-slate-600">
                                    <div className="flex items-center gap-1">
                                      {(pat.icuAdmissionDate || (pat as any).admissionDate) && (
                                        <>
                                          <span title="入ICU日" className="text-blue-500 font-medium">{pat.icuAdmissionDate || (pat as any).admissionDate}</span>
                                          <span className="text-slate-355">➔</span>
                                        </>
                                      )}
                                      <span title="照會日" className="text-slate-500">{pat.consultDate || "-"}</span>
                                      <span className="text-slate-350">➔</span>
                                      <span title="回覆日" className="text-indigo-600 font-medium">{pat.replyDate || "-"}</span>
                                      <span className="text-slate-350">➔</span>
                                      <span title="開案介入日" className="text-teal-600 font-medium">{pat.firstPTDate || "-"}</span>
                                      {pat.icuDischargeDate && (
                                        <>
                                          <span className="text-slate-350">➔</span>
                                          <span title="轉出日" className="text-rose-500 font-semibold">{pat.icuDischargeDate}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-sans mt-0.5">
                                      {pat.consultDate && pat.icuDischargeDate && (
                                        <div>
                                          ICU停留：
                                          <span className="font-bold text-rose-600">
                                            {getDaysBetween(pat.consultDate, pat.icuDischargeDate)}
                                          </span>
                                          {" "}天
                                        </div>
                                      )}
                                      {(pat.icuAdmissionDate || (pat as any).admissionDate) && pat.icuDischargeDate && (
                                        <div>
                                          ICU住院：
                                          <span className="font-bold text-blue-600">
                                            {getDaysBetween(pat.icuAdmissionDate || (pat as any).admissionDate, pat.icuDischargeDate)}
                                          </span>
                                          {" "}天
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {latestLog ? (
                                    <div className="flex items-center justify-center gap-1.5" title={levelInfo?.definition}>
                                      <span className="w-5.5 h-5.5 rounded-full flex items-center justify-center bg-teal-500 text-white font-mono font-bold text-[10px]">
                                        {latestLog.mobilityLevel}
                                      </span>
                                      <span className="font-semibold text-slate-700 leading-none">{levelInfo?.name}</span>
                                    </div>
                                  ) : patLogsCount > 0 ? (
                                    <div className="text-center text-slate-400 text-[11px] font-medium">未介入不需評估</div>
                                  ) : (
                                    <div className="text-center text-slate-350 text-[11px]">未開案</div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-slate-500 whitespace-nowrap">
                                  {patLogsCount} 次
                                </td>
                                <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      onClick={() => setSelectedPatientId(pat.id)}
                                      className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold rounded cursor-pointer transition-colors border border-slate-300"
                                    >
                                      療程追蹤
                                    </button>

                                    {isAdmin && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setEditingPatient(pat);
                                            setShowEditPatientModal(true);
                                          }}
                                          className="p-1.5 text-slate-500 hover:text-teal-600 border border-slate-200 hover:border-teal-300 rounded cursor-pointer transition-colors"
                                          title="編輯個案基本資料"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDeletePatient(pat.id)}
                                          className="p-1.5 text-rose-500 hover:text-rose-800 border border-slate-200 hover:border-rose-300 rounded cursor-pointer transition-colors"
                                          title="個案結案並刪除"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit/Add Patient Profile Dialog Modal Window */}
      {showEditPatientModal && (
        <EditPatientModal
          patient={editingPatient}
          onClose={() => {
            setShowEditPatientModal(false);
            setEditingPatient(null);
          }}
          onRefresh={() => {
            // Logs reload handled automatically by listener React updates
          }}
        />
      )}

      {/* Footer copyright */}
      <footer className="bg-slate-900 border-t border-slate-800 shrink-0 text-slate-500 text-[11px] py-4 select-none">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center">
          <p>© 2026 加護病房神經外科 物理治療工作執行與績效統計管理平台</p>
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-teal-500/80" />
            <span>臨床指引：ICU Mobility Scale (IMS) · 即時資料存儲防護模式</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
