import React, { useState } from "react";
import { Patient } from "../types";
import { doc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { User, ClipboardList, Calendar, Info, X, HeartPlus } from "lucide-react";

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
  const [notes, setNotes] = useState(patient?.notes || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      <div className="bg-white border border-slate-200 w-full max-w-lg rounded-xl overflow-hidden shadow-2xl animate-scaleIn">
        {/* Modal Header */}
        <div className="bg-slate-850 px-5 py-4 border-b border-slate-200 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <HeartPlus className="w-4.5 h-4.5 text-teal-400" />
            <h4 className="font-bold text-sm">
              {patient ? `編輯個案：${patient.name}` : "新增神經外科 ICU PT 追蹤個案"}
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                placeholder="請描述照手診斷細目 (例如 SAH s/p craniotomy, ICH...)"
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Reference Dates Milestones */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-consult-input">照會日期</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 px-1 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  id="pat-consult-input"
                  type="date"
                  value={consultDate}
                  onChange={(e) => setConsultDate(e.target.value)}
                  className="block w-full pl-7 pr-1 py-2 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-reply-input">回覆醫師照會</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 px-1 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  id="pat-reply-input"
                  type="date"
                  value={replyDate}
                  onChange={(e) => setReplyDate(e.target.value)}
                  className="block w-full pl-7 pr-1 py-2 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-first-pt-input">第一次介入</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 px-1 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  id="pat-first-pt-input"
                  type="date"
                  value={firstPTDate}
                  onChange={(e) => setFirstPTDate(e.target.value)}
                  className="block w-full pl-7 pr-1 py-2 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-icu-discharge-input">轉出加護病房</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 px-1 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  id="pat-icu-discharge-input"
                  type="date"
                  value={icuDischargeDate}
                  onChange={(e) => setIcuDischargeDate(e.target.value)}
                  className="block w-full pl-7 pr-1 py-2 border border-slate-300 rounded-lg bg-slate-50 text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Clinical Profile notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1" htmlFor="pat-notes-textarea">個案病史說明 / 其他備註</label>
            <textarea
              id="pat-notes-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="可鍵入病史背景、特殊復健目標、或生命徵象注意事項等備忘細節..."
              className="block w-full text-xs p-2.5 border border-slate-300 bg-slate-50 rounded-lg outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
            />
          </div>

          {/* Dialog Action Buttons */}
          <div className="pt-2 flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 rounded-lg transition-colors cursor-pointer"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="py-2.5 px-5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-bold rounded-lg transition-colors cursor-pointer"
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
