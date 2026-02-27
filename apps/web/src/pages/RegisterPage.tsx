import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <main className="loading" style={{ padding: 16 }}>
      <section
        style={{
          width: "min(420px, 94vw)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.62)",
          background: "linear-gradient(170deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))",
          boxShadow: "0 18px 34px rgba(15,23,42,0.14)",
          backdropFilter: "blur(20px)",
          padding: 18,
          display: "grid",
          gap: 12
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>注册账号</h1>
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
        {mismatch ? <div style={{ fontSize: 12, color: "#b91c1c" }}>两次输入的密码不一致</div> : null}
        {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
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
        <Link to="/login" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}>
          已有账号？去登录
        </Link>
      </section>
    </main>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(203,213,225,0.72)",
  background: "linear-gradient(160deg, rgba(255,255,255,0.78), rgba(255,255,255,0.46))",
  padding: "9px 10px",
  color: "#0f172a",
  fontSize: 13
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(96,165,250,0.62)",
  background: "linear-gradient(155deg, rgba(37,99,235,0.8), rgba(56,189,248,0.7))",
  color: "#eff6ff",
  padding: "9px 10px",
  fontSize: 13,
  cursor: "pointer"
};
