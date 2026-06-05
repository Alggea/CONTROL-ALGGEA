import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const ProtectedRoute = ({ children, allowPasswordChangeRequired = false }) => {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
          Cargando…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Force password change before any other route
  if (
    user.must_change_password &&
    !allowPasswordChangeRequired &&
    location.pathname !== "/cambiar-contrasena"
  ) {
    return <Navigate to="/cambiar-contrasena" replace state={{ from: location.pathname }} />;
  }
  return children;
};
