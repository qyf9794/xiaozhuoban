import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { defaultAnimatedBackgroundUrl } from "../lib/defaultBackground";

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <main className="login-page">
      <div className="app-background-layer" style={{ backgroundColor: "#5b6b7a" }} aria-hidden="true">
        <img className="app-background-media" src={defaultAnimatedBackgroundUrl} alt="" />
        <div className="login-page-scrim" />
      </div>
      <section className="login-page-card liquid-glass" style={registerCardStyle}>
        <h1 style={{ margin: 0, fontSize: 19, color: "rgba(255,255,255,0.96)" }}>注册账号</h1>
        <input
          className="login-input"
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
          className="login-input"
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
          className="login-input"
          type="password"
          placeholder="确认密码"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          style={inputStyle}
        />
        {mismatch ? <div className="login-error">两次输入的密码不一致</div> : null}
        {error ? <div className="login-error">{error}</div> : null}
        <button
          className="login-button"
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
        <Link to="/login" className="login-link" style={{ fontSize: 12, textDecoration: "none" }}>
          已有账号？去登录
        </Link>
      </section>
    </main>
  );
}

const registerCardStyle: CSSProperties = {
  width: "min(340px, 88vw)",
  borderRadius: 22,
  padding: 16,
  display: "grid",
  gap: 12
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.04)",
  padding: "10px 12px",
  color: "rgba(255,255,255,0.96)",
  fontSize: 13
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.98)",
  padding: "10px 12px",
  fontSize: 13,
  cursor: "pointer"
};
