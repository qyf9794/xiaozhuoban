import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { showDesktopWindowWhenReady } from "../lib/desktopWindow";

type AuthPageShellProps = {
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthPageShell({ title, children, footer }: AuthPageShellProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    void import("../App");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    const markReady = () => {
      if (cancelled) return;
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        setMediaReady(true);
        void showDesktopWindowWhenReady();
      });
    };

    if (!video || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady();
      return () => {
        cancelled = true;
      };
    }

    video.addEventListener("loadeddata", markReady, { once: true });
    video.addEventListener("error", markReady, { once: true });

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("error", markReady);
    };
  }, []);

  return (
    <main className="auth-shell">
      <video
        ref={videoRef}
        className="auth-shell__video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/media/auth-background.mp4" type="video/mp4" />
      </video>
      <div className="auth-shell__scrim" aria-hidden="true" />
      {mediaReady ? (
        <section className="auth-card liquid-glass">
          <div className="auth-card__content">
            <h1 className="auth-card__title">{title}</h1>
            {children}
            <div className="auth-card__footer">{footer}</div>
          </div>
        </section>
      ) : (
        <section className="auth-card liquid-glass" style={loadingCardStyle}>
          <div aria-hidden="true" style={spinnerStyle} />
          <strong style={{ fontSize: 16, color: "#ffffff" }}>正在准备登录界面</strong>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.76)" }}>动画资源加载完成后再显示登录窗口</div>
        </section>
      )}
    </main>
  );
}

const loadingCardStyle: CSSProperties = {
  minHeight: 168,
  display: "grid",
  gap: 12,
  placeItems: "center",
  textAlign: "center",
  padding: 18
};

const spinnerStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "2px solid rgba(255, 255, 255, 0.18)",
  borderTopColor: "rgba(255, 255, 255, 0.96)"
};
