import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { fmtErr } from "@/lib/api";
import { ArrowRight } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user?.must_change_password) {
        navigate("/cambiar-contrasena", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e2) {
      setErr(fmtErr(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#FAFAFA]">
      {/* Left: image / structural panel */}
      <div className="hidden lg:flex relative bg-slate-950 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBhYnN0cmFjdCUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3Nzk5OTk4NTN8MA&ixlib=rb-4.1.0&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/30" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="font-display font-black text-3xl tracking-tighter">
              CONTROL<span className="text-brand">.</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-300 mt-2">
              Sistema Administrativo
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="font-display font-black text-5xl tracking-tighter leading-[0.95]">
              Una sola fuente <br/>de verdad <br/>
              <span className="text-brand">financiera.</span>
            </h1>
            <p className="text-slate-300 max-w-md leading-relaxed">
              Control total sobre ingresos, egresos y utilidades.
            </p>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-10">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">
              Iniciar sesión / 01
            </div>
            <h2 className="font-display font-black text-4xl tracking-tighter text-slate-950">
              Acceso de socios
            </h2>
            <p className="text-slate-600 mt-3 text-sm">
              Ingresa tus credenciales para acceder al sistema.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
                Correo electrónico
              </label>
              <input
                data-testid="login-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-1 transition-colors duration-200 text-sm"
                placeholder="usuario@socios.com"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
                Contraseña
              </label>
              <input
                data-testid="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-1 transition-colors duration-200 text-sm"
                placeholder="••••••••"
              />
            </div>

            {err && (
              <div data-testid="login-error" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                {err}
              </div>
            )}

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white py-3.5 font-semibold text-sm hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            >
              {loading ? "Ingresando..." : "Iniciar sesión"}
              {!loading && <ArrowRight size={16} weight="bold" />}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <p className="text-xs text-slate-500 leading-relaxed">
              Si es tu <span className="font-semibold text-slate-700">primer inicio de sesión</span>, el sistema te pedirá establecer una nueva contraseña antes de continuar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
