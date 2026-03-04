import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";

const App = lazy(async () => {
  const module = await import("../App");
  return { default: module.App };
});

const LoginPage = lazy(async () => {
  const module = await import("../pages/LoginPage");
  return { default: module.LoginPage };
});

const RegisterPage = lazy(async () => {
  const module = await import("../pages/RegisterPage");
  return { default: module.RegisterPage };
});

export function AppRouter() {
  const { ready, user, initialize } = useAuthStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!ready) {
    return <div className="loading">正在加载登录态...</div>;
  }

  return (
    <Suspense fallback={<div className="loading">页面加载中...</div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
        <Route path="/app" element={user ? <App /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={user ? "/app" : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}
