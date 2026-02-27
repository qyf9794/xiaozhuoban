import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { App } from "../App";
import { useAuthStore } from "../auth/authStore";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";

export function AppRouter() {
  const { ready, user, initialize } = useAuthStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!ready) {
    return <div className="loading">正在加载登录态...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
      <Route path="/app" element={user ? <App /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? "/app" : "/login"} replace />} />
    </Routes>
  );
}
