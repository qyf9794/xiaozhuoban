import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { AuthPageShell } from "../components/AuthPageShell";

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthPageShell
      title="登录小桌板"
      footer={
        <Link to="/register" className="auth-link">
          还没有账号？去注册
        </Link>
      }
    >
        <input
          type="email"
          placeholder="邮箱"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearError();
          }}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearError();
          }}
          style={inputStyle}
        />
        {error ? <div className="auth-message">{error}</div> : null}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await signIn(email.trim(), password);
                navigate("/app", { replace: true });
              } catch {
                // error message is handled by auth store
              }
            })();
          }}
          disabled={loading || !email.trim() || !password}
          style={primaryButtonStyle}
        >
          {loading ? "登录中..." : "登录"}
        </button>
    </AuthPageShell>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  padding: "10px 12px",
  color: "#ffffff",
  fontSize: 13,
  outline: "none",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08)"
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
  color: "#ffffff",
  padding: "10px 12px",
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12)"
};
