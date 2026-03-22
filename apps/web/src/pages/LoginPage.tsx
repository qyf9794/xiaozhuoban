import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { defaultAnimatedBackgroundUrl } from "../lib/defaultBackground";
import { showDesktopWindowWhenReady } from "../lib/desktopWindow";

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [backgroundReady, setBackgroundReady] = useState(false);

  useEffect(() => {
    void import("../App");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const backgroundImage = new Image();

    const markReady = () => {
      if (cancelled) return;
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        setBackgroundReady(true);
        void showDesktopWindowWhenReady();
      });
    };

    backgroundImage.decoding = "async";
    backgroundImage.onload = markReady;
    backgroundImage.onerror = markReady;
    backgroundImage.src = defaultAnimatedBackgroundUrl;

    if (backgroundImage.complete) {
      markReady();
    }

    return () => {
      cancelled = true;
      backgroundImage.onload = null;
      backgroundImage.onerror = null;
    };
  }, []);

  return (
    <main className="login-page">
      <div className="app-background-layer" style={{ backgroundColor: "#5b6b7a" }} aria-hidden="true">
        <img className="app-background-media" src={defaultAnimatedBackgroundUrl} alt="" />
        <div className="login-page-scrim" />
      </div>
      {backgroundReady ? (
        <section className="login-page-card liquid-glass" style={loginCardStyle}>
          <h1 style={{ margin: 0, fontSize: 19, color: "rgba(255,255,255,0.96)" }}>登录小桌板</h1>
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
            placeholder="密码"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            style={inputStyle}
          />
          {error ? <div className="login-error">{error}</div> : null}
          <button
            className="login-button"
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
          <Link to="/register" className="login-link" style={{ fontSize: 12, textDecoration: "none" }}>
            还没有账号？去注册
          </Link>
        </section>
      ) : (
        <section
          className="login-page-card liquid-glass"
          style={{ ...loginCardStyle, minHeight: 168, placeItems: "center", textAlign: "center" }}
        >
          <div aria-hidden="true" style={spinnerStyle} />
          <strong style={{ fontSize: 16, color: "rgba(255,255,255,0.96)" }}>正在准备登录界面</strong>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.76)" }}>背景动画加载完成后再显示登录窗口</div>
        </section>
      )}
    </main>
  );
}

const loginCardStyle: CSSProperties = {
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

const spinnerStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "2px solid rgba(255, 255, 255, 0.18)",
  borderTopColor: "rgba(255, 255, 255, 0.96)"
};
