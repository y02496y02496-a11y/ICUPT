import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { sha256, generateSalt } from "../utils";
import { KeyRound, Lock, Eye, EyeOff, ShieldAlert, CheckCircle } from "lucide-react";

interface AdminVerificationProps {
  onVerifySuccess: () => void;
  onCancel: () => void;
}

export default function AdminVerification({ onVerifySuccess, onCancel }: AdminVerificationProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const configDocRef = doc(db, "config", "admin");

  useEffect(() => {
    async function checkAdminConfig() {
      try {
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          setIsFirstTime(false);
        } else {
          setIsFirstTime(true);
        }
      } catch (err) {
        console.error("Failed to check admin config:", err);
        setError("無法連線至資料庫，請檢查網路連線或 Firebase 規則設定。");
      } finally {
        setLoading(false);
      }
    }
    checkAdminConfig();
  }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!password) {
      setError("請輸入密碼。");
      return;
    }

    if (password.length < 6) {
      setError("為了資訊安全，密碼必須至少為 6 個字元。");
      return;
    }

    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致，請重新檢查。");
      return;
    }

    try {
      setLoading(true);
      const salt = generateSalt();
      const combined = password + salt;
      const passHash = await sha256(combined);

      await setDoc(configDocRef, {
        passwordHash: passHash,
        salt: salt,
        updatedAt: Date.now(),
      });

      setSuccess("管理者密碼設定成功！即將進入系統...");
      setTimeout(() => {
        onVerifySuccess();
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "config/admin");
      setError("密碼儲存失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("請輸入密碼。");
      return;
    }

    try {
      setLoading(true);
      const docSnap = await getDoc(configDocRef);
      if (!docSnap.exists()) {
        setError("找不到管理者設定，請重整頁面進行設定。");
        return;
      }

      const data = docSnap.data();
      const storedHash = data.passwordHash;
      const storedSalt = data.salt;

      const combined = password + storedSalt;
      const inputHash = await sha256(combined);

      if (inputHash === storedHash) {
        setSuccess("驗證成功！正在登入...");
        setTimeout(() => {
          onVerifySuccess();
        }, 1000);
      } else {
        setError("密碼不正確，請重新輸入！");
        setPassword("");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "config/admin");
      setError("資料庫讀取失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }

  if (loading && isFirstTime === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-slate-600">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 font-medium">連線至資料庫中...</p>
      </div>
    );
  }

  return (
    <div id="admin-verify-container" className="flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden transition-all duration-300">
        {/* Header Block with Teal/Slate Accents */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-8 text-center relative border-b border-slate-700">
          <div className="mx-auto w-16 h-16 bg-teal-500/10 border border-teal-500/30 rounded-full flex items-center justify-center mb-4 text-teal-400">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">
            {isFirstTime ? "設定管理者密碼" : "後台管理者驗證"}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isFirstTime
              ? "這是您第一次啟用系統。請為後台資料管理設定防護密碼。"
              : "編輯個案、床號日誌及復健紀錄需要主管權限。"}
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm flex items-start gap-2 animate-fadeIn">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-start gap-2 animate-fadeIn">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {isFirstTime ? (
            /* First Time Password Setup Form */
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="new-pass-input">
                  管理者新密碼 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="new-pass-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請輸入欲設定的管理者密碼"
                    className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="confirm-pass-input">
                  確認管理者密碼 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="confirm-pass-input"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="請再次輸入密碼以符合確認"
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-2 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer"
                  disabled={loading}
                >
                  回前台首頁
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-medium text-sm rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                  disabled={loading}
                >
                  {loading ? "處理中..." : "建立並啟用"}
                </button>
              </div>
            </form>
          ) : (
            /* Regular Verification Form */
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="verify-pass-input">
                  請輸入管理者密碼
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="verify-pass-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請填寫管理者安全防護密碼"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-2.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer"
                  disabled={loading}
                >
                  回前台首頁
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-medium text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
                  disabled={loading}
                >
                  {loading ? "驗證中..." : "驗證登入"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
