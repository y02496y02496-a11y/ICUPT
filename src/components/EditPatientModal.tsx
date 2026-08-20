import React, { useState } from "react";
import { Patient, GCS_EYE_OPTIONS, GCS_VERBAL_OPTIONS, GCS_MOTOR_OPTIONS } from "../types";
import { doc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { computeGcsResult } from "../utils";
import { User, ClipboardList, Calendar, Info, X, HeartPlus, Brain, Activity } from "lucide-react";

interface EditPatientModalProps {
  patient: Patient | null; // Null means we are creating a new patient
  onClose: () => void;
  onRefresh: () => void;
}

export default function EditPatientModal({ patient, onClose, onRefresh }: EditPatientModalProps) {
  const [bedValue, setBedValue] = useState(patient?.bedValue || "");
  const [chartNo, setChartNo] = useState(patient?.chartNo || "");
  const [name, setName] = useState(patient?.name || "");
  const [diagnosis, setDiagnosis] = useState(patient?.diagnosis || "");
  const [consultDate, setConsultDate] = useState(patient?.consultDate || "");
  const [replyDate, setReplyDate] = useState(patient?.replyDate || "");
  const [firstPTDate, setFirstPTDate] = useState(patient?.firstPTDate || "");
  const [icuDischargeDate, setIcuDischargeDate] = useState(patient?.icuDischargeDate || "");
  const [icuAdmissionDate, setIcuAdmissionDate] = useState(patient?.icuAdmissionDate || (patient as any)?.admissionDate || "");
  const [erAdmissionDate, setErAdmissionDate] = useState(patient?.erAdmissionDate || "");

  // ER GCS
  const [erGcsEye, setErGcsEye] = useState<number | "">(patient?.erGcsEye ?? "");
  const [erGcsVerbal, setErGcsVerbal] = useState<number | string | "">(patient?.erGcsVerbal ?? "");
  const [erGcsMotor, setErGcsMotor] = useState<number | "">(patient?.erGcsMotor ?? "");

  // ICU Admission GCS
  const [icuGcsEye, setIcuGcsEye] = useState<number | "">(patient?.icuGcsEye ?? "");
  const [icuGcsVerbal, setIcuGcsVerbal] = useState<number | string | "">(patient?.icuGcsVerbal ?? "");
  const [icuGcsMotor, setIcuGcsMotor] = useState<number | "">(patient?.icuGcsMotor ?? "");

  const [notes, setNotes] = useState(patient?.notes || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Real-time computed GCS results
  const erGcsResult = computeGcsResult(erGcsEye, erGcsVerbal, erGcsMotor);
  const icuGcsResult = computeGcsResult(icuGcsEye, icuGcsVerbal, icuGcsMotor);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!bedValue.trim() || !chartNo.trim() || !name.trim()) {
      setError("床號、病歷號碼、姓名為必填欄位。");
      return;
    }

    try {
      setSubmitting(true);
      const patientId = patient ? patient.id : `pat_${Date.now()}`;
      const docRef = doc(db, "patients", patientId);

      const payload: Omit<Patient, "id"> = {
        bedValue: bedValue.trim(),
        chartNo: chartNo.trim(),
        name: name.trim(),
        diagnosis: diagnosis.trim(),
        consultDate: consultDate,
        replyDate: replyDate,
        firstPTDate: firstPTDate,
        icuDischargeDate: icuDischargeDate,
        icuAdmissionDate: icuAdmissionDate ?? "",
        erAdmissionDate: erAdmissionDate,
        
        // ER GCS
        erGcsEye: erGcsEye !== "" ? Number(erGcsEye) : null,
        erGcsVerbal: erGcsVerbal !== "" ? (erGcsVerbal === "a" || erGcsVerbal === "e" || erGcsVerbal === "t" ? erGcsVerbal : Number(erGcsVerbal)) : null,
        erGcsMotor: erGcsMotor !== "" ? Number(erGcsMotor) : null,
        erGcsTotal: erGcsResult.totalScoreValue,

        // ICU GCS
        icuGcsEye: icuGcsEye !== "" ? Number(icuGcsEye) : null,
        icuGcsVerbal: icuGcsVerbal !== "" ? (icuGcsVerbal === "a" || icuGcsVerbal === "e" || icuGcsVerbal === "t" ? icuGcsVerbal : Number(icuGcsVerbal)) : null,
        icuGcsMotor: icuGcsMotor !== "" ? Number(icuGcsMotor) : null,
        icuGcsTotal: icuGcsResult.totalScoreValue,

        notes: notes.trim(),
        createdAt: patient ? patient.createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(docRef, payload);
      onRefresh();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `patients/${patient ? patient.id : "new"}`);
      setError("儲存病患資料失敗，請重試！");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-2xl max-h-[92vh] rounded-xl overflow-hidden shadow-2xl flex flex-col animate-scaleIn">
        {/* Modal Header */}
        <div className="bg-slate-850 px-5 py-4 border-b border-slate-200 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <HeartPlus className="w-4.5 h-4.5 text-teal-400" />
            <h4 className="font-bold text-sm">
              {patient ? `編輯個案基本資料：${patient.name}` : "新增神經外科 ICU PT 追蹤個案"}
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Scrollable Area */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4.5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-1.5 font-medium animate-fadeIn">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Bed Value, Name, and Chart Number */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-bed-input">床號 <span className="text-rose-500">*</span></label>
              <input
                id="pat-bed-input"
                type="text"
                value={bedValue}
                onChange={(e) => setBedValue(e.target.value)}
                placeholder="例如: 12-1"
                className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800 focus:ring-1 focus:ring-teal-500 font-semibold"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-chart-input">病歷號碼 <span className="text-rose-500">*</span></label>
              <input
                id="pat-chart-input"
                type="text"
                value={chartNo}
                onChange={(e) => setChartNo(e.target.value)}
                placeholder="病歷號首碼"
                className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800 focus:ring-1 focus:ring-teal-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-name-input">姓名 <span className="text-rose-500">*</span></label>
              <input
                id="pat-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 王小明"
                className="block w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-slate-50 outline-none text-slate-800 focus:ring-1 focus:ring-teal-500 font-bold"
                required
              />
            </div>
          </div>

          {/* Medical Diagnosis Description */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-diag-input">復健照會診斷說明</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <ClipboardList className="w-4 h-4" />
              </div>
              <input
                id="pat-diag-input"
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="請描述照會診斷細目 (例如 SAH s/p craniotomy, ICH...)"
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Reference Dates Milestones */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>關鍵時程與里程日期</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-er-admission-input">入急診日期</label>
                <input
                  id="pat-er-admission-input"
                  type="date"
                  value={erAdmissionDate}
                  onChange={(e) => setErAdmissionDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-admission-input">入ICU日期</label>
                <input
                  id="pat-admission-input"
                  type="date"
                  value={icuAdmissionDate}
                  onChange={(e) => setIcuAdmissionDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-consult-input">照會日期</label>
                <input
                  id="pat-consult-input"
                  type="date"
                  value={consultDate}
                  onChange={(e) => setConsultDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-reply-input">回覆照會</label>
                <input
                  id="pat-reply-input"
                  type="date"
                  value={replyDate}
                  onChange={(e) => setReplyDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-first-pt-input">第一次介入</label>
                <input
                  id="pat-first-pt-input"
                  type="date"
                  value={firstPTDate}
                  onChange={(e) => setFirstPTDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1" htmlFor="pat-icu-discharge-input">轉出ICU</label>
                <input
                  id="pat-icu-discharge-input"
                  type="date"
                  value={icuDischargeDate}
                  onChange={(e) => setIcuDischargeDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Admission GCS Assessments: ER & ICU */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-800">
                  收案里程 GCS 意識狀態評估 (入急診 / 入ICU 當天)
                </span>
              </div>
              <span className="text-[10px] text-slate-500">
                特殊代碼 (a/e/t) 不計分，自動以有意義總分換算嚴重度
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ER GCS Section */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="text-[11px] font-bold text-slate-700">入急診當天 GCS 評估</span>
                  </div>
                  {erAdmissionDate ? (
                    <span className="text-[10px] text-slate-400 font-mono">({erAdmissionDate})</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">未填急診日</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="er-gcs-eye">E (睜眼)</label>
                    <select
                      id="er-gcs-eye"
                      value={erGcsEye}
                      onChange={(e) => setErGcsEye(e.target.value === "" ? "" : Number(e.target.value))}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_EYE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.value} 分</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="er-gcs-verbal">V (語言)</label>
                    <select
                      id="er-gcs-verbal"
                      value={erGcsVerbal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") setErGcsVerbal("");
                        else if (val === "a" || val === "e" || val === "t") setErGcsVerbal(val);
                        else setErGcsVerbal(Number(val));
                      }}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_VERBAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value === "a" || opt.value === "e" || opt.value === "t" ? opt.value : `${opt.value} 分`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="er-gcs-motor">M (運動)</label>
                    <select
                      id="er-gcs-motor"
                      value={erGcsMotor}
                      onChange={(e) => setErGcsMotor(e.target.value === "" ? "" : Number(e.target.value))}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_MOTOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.value} 分</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ER GCS Summary display */}
                {erGcsEye !== "" || erGcsVerbal !== "" || erGcsMotor !== "" ? (
                  <div className={`p-2 rounded border text-xs font-semibold space-y-1 ${erGcsResult.severity?.color || "bg-slate-50 border-slate-200 text-slate-700"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[11px]">
                        {erGcsResult.formula} = {erGcsResult.totalDisplay}
                      </span>
                      {erGcsResult.severity && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold bg-white border border-slate-200 shadow-xs">
                          {erGcsResult.severity.name}
                        </span>
                      )}
                    </div>
                    {erGcsResult.isUnscoreableV && (
                      <div className="text-[9.5px] font-normal text-slate-500">
                        語言反應為特殊代碼 <span className="font-bold text-slate-700">{erGcsVerbal}</span> ({erGcsResult.unscoreableReason}) 不計分，睜眼與運動累計 {erGcsResult.sumScore} 分。
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 italic text-center py-1">未輸入入急診當天 GCS</div>
                )}
              </div>

              {/* ICU Admission GCS Section */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-[11px] font-bold text-slate-700">入ICU當天 GCS 評估</span>
                  </div>
                  {icuAdmissionDate ? (
                    <span className="text-[10px] text-slate-400 font-mono">({icuAdmissionDate})</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">未填入ICU日</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="icu-gcs-eye">E (睜眼)</label>
                    <select
                      id="icu-gcs-eye"
                      value={icuGcsEye}
                      onChange={(e) => setIcuGcsEye(e.target.value === "" ? "" : Number(e.target.value))}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_EYE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.value} 分</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="icu-gcs-verbal">V (語言)</label>
                    <select
                      id="icu-gcs-verbal"
                      value={icuGcsVerbal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") setIcuGcsVerbal("");
                        else if (val === "a" || val === "e" || val === "t") setIcuGcsVerbal(val);
                        else setIcuGcsVerbal(Number(val));
                      }}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_VERBAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value === "a" || opt.value === "e" || opt.value === "t" ? opt.value : `${opt.value} 分`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1" htmlFor="icu-gcs-motor">M (運動)</label>
                    <select
                      id="icu-gcs-motor"
                      value={icuGcsMotor}
                      onChange={(e) => setIcuGcsMotor(e.target.value === "" ? "" : Number(e.target.value))}
                      className="block w-full text-[11px] p-1.5 border border-slate-300 rounded bg-white outline-none text-slate-800 font-mono focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">未評</option>
                      {GCS_MOTOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.value} 分</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ICU GCS Summary display */}
                {icuGcsEye !== "" || icuGcsVerbal !== "" || icuGcsMotor !== "" ? (
                  <div className={`p-2 rounded border text-xs font-semibold space-y-1 ${icuGcsResult.severity?.color || "bg-slate-50 border-slate-200 text-slate-700"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[11px]">
                        {icuGcsResult.formula} = {icuGcsResult.totalDisplay}
                      </span>
                      {icuGcsResult.severity && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold bg-white border border-slate-200 shadow-xs">
                          {icuGcsResult.severity.name}
                        </span>
                      )}
                    </div>
                    {icuGcsResult.isUnscoreableV && (
                      <div className="text-[9.5px] font-normal text-slate-500">
                        語言反應為特殊代碼 <span className="font-bold text-slate-700">{icuGcsVerbal}</span> ({icuGcsResult.unscoreableReason}) 不計分，睜眼與運動累計 {icuGcsResult.sumScore} 分。
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 italic text-center py-1">未輸入入ICU當天 GCS</div>
                )}
              </div>
            </div>
          </div>

          {/* Clinical Profile notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-notes-textarea">個案病史說明 / 其他備註</label>
            <textarea
              id="pat-notes-textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="可鍵入病史背景、特殊復健目標、或生命徵象注意事項等備忘細節..."
              className="block w-full text-xs p-2.5 border border-slate-300 bg-slate-50 rounded-lg outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
            />
          </div>

          {/* Dialog Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 text-xs border-t border-slate-150">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 rounded-lg transition-colors cursor-pointer"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="py-2 px-5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-bold rounded-lg transition-colors cursor-pointer"
              disabled={submitting}
            >
              {submitting ? "資料寫入中..." : "保存變更"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
