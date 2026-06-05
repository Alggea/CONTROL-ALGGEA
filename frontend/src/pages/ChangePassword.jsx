import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Key, ArrowRight, CheckCircle, ShieldCheck, Eye, EyeSlash } from "@phosphor-icons/react";
import { toast } from "sonner";

const MIN_LEN = 8;

function passwordChecks(pw) {
  return {
    length: pw.length >= MIN_LEN,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

function strengthScore(checks) {
  return Object.values(checks).filter(Boolean).length;
}

export default function ChangePassword() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = !!user?.must_change_password;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const checks = passwordChecks(next);
  const score = strengthScore(checks);
  const strengthLabel = score <= 2 ? "Débil" : score <= 3 ? "Regular" : score <= 4 ? "Fuerte" : "Muy fuerte";
  const strengthColor = score <= 2 ? "bg-red-500" : score <= 3 ? "bg-amber-500" : score <= 4 ? "bg-emerald-500" : "bg-emerald-600";

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (next !== confirm) {
      setErr("La confirmación no coincide con la nueva contraseña");
      return;
    }
    if (!checks.length) {
      setErr(`La nueva contraseña debe tener al menos ${MIN_LEN} caracteres`);
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast.success("Contraseña actualizada");
      if (refresh) await refresh();
      const redirectTo = location.state?.from || "/";
      navigate(redirectTo, { replace: true });
    } catch (e2) {
      setErr(fmtErr(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-slate-200 animate-fade-in" data-testid="change-password-page">
        <div className="grid md:grid-cols-[1fr_1.4fr]">
          {/* Left rail */}
          <div className="bg-slate-950 text-white p-8 md:p-10 flex flex-col justify-between">
            <div>
              <div className="font-display font-black text-2xl tracking-tighter">
                CONTROL<span className="text-brand">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400 mt-1">
                Seguridad / 01
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-10 w-10 bg-brand flex items-center justify-center">
                <ShieldCheck size={22} weight="bold" />
              </div>
              <h2 className="font-display font-black text-3xl tracking-tighter leading-none">
                {forced ? "Establece tu contraseña" : "Cambia tu contraseña"}
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                {forced
                  ? "Es tu primer inicio. Define una contraseña personal antes de continuar."
                  : "Mantén tu cuenta segura cambiando tu contraseña periódicamente."}
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Cuenta</div>
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-slate-400 font-mono">{user?.email}</div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="p-8 md:p-10 space-y-5" data-testid="change-password-form">
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
                Contraseña actual *
              </label>
              <div className="relative">
                <Key size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="current-password"
                  type={show ? "text" : "password"}
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
                Nueva contraseña *
              </label>
              <div className="relative">
                <Key size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="new-password"
                  type={show ? "text" : "password"}
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  data-testid="toggle-show"
                >
                  {show ? <EyeSlash size={14} weight="bold" /> : <Eye size={14} weight="bold" />}
                </button>
              </div>
              {next && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full ${strengthColor} transition-all duration-300`}
                        style={{ width: `${(score / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                      {strengthLabel}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {[
                      ["length", `Mínimo ${MIN_LEN} caracteres`],
                      ["upper", "Una mayúscula"],
                      ["lower", "Una minúscula"],
                      ["digit", "Un número"],
                      ["symbol", "Un símbolo"],
                    ].map(([k, label]) => (
                      <li key={k} className={`flex items-center gap-1 ${checks[k] ? "text-emerald-700" : "text-slate-400"}`}>
                        <CheckCircle size={11} weight={checks[k] ? "fill" : "regular"} />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
                Confirmar nueva contraseña *
              </label>
              <input
                data-testid="confirm-password"
                type={show ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`w-full px-4 py-2.5 bg-white border focus:outline-none text-sm transition-colors duration-200 ${
                  confirm && next !== confirm
                    ? "border-red-400 focus:border-red-600"
                    : "border-slate-300 focus:border-slate-950"
                }`}
                autoComplete="new-password"
              />
              {confirm && next !== confirm && (
                <div className="mt-1 text-xs text-red-700">No coincide con la nueva contraseña</div>
              )}
            </div>

            {err && (
              <div data-testid="change-pw-error" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                {err}
              </div>
            )}

            <button
              type="submit"
              data-testid="change-pw-submit"
              disabled={loading || !checks.length || next !== confirm || !current}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white py-3 text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Guardando..." : forced ? "Establecer y continuar" : "Actualizar contraseña"}
              {!loading && <ArrowRight size={16} weight="bold" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
