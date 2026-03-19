import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { AuthPageShell } from "../components/AuthPageShell";

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthPageShell
      title="注册账号"
      footer={
        <Link to="/login" className="auth-link">
          已有账号？去登录
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
          placeholder="密码（至少6位）"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearError();
          }}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="确认密码"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          style={inputStyle}
        />
        {mismatch ? <div className="auth-message">两次输入的密码不一致</div> : null}
        {error ? <div className="auth-message">{error}</div> : null}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              if (mismatch) return;
              try {
                await signUp(email.trim(), password);
                navigate("/app", { replace: true });
              } catch {
                // error message is handled by auth store
              }
            })();
          }}
          disabled={loading || !email.trim() || password.length < 6 || mismatch}
          style={primaryButtonStyle}
        >
          {loading ? "注册中..." : "注册并进入"}
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
