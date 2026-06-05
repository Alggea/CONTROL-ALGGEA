import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import Transactions from "@/pages/Transactions";
import PartnerPortal from "@/pages/PartnerPortal";
import AuditLog from "@/pages/AuditLog";
import Clients from "@/pages/Clients";
import Providers from "@/pages/Providers";
import ChangePassword from "@/pages/ChangePassword";
import Settings from "@/pages/Settings";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/cambiar-contrasena"
              element={
                <ProtectedRoute allowPasswordChangeRequired>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="clients" element={<Clients />} />
              <Route path="providers" element={<Providers />} />
              <Route path="partners" element={<PartnerPortal />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="configuracion" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
