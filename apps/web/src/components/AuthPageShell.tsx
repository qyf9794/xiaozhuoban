import { useEffect, useRef, type ReactNode } from "react";
import { showDesktopWindowWhenReady } from "../lib/desktopWindow";

type AuthPageShellProps = {
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthPageShell({ title, children, footer }: AuthPageShellProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void showDesktopWindowWhenReady();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);

    const prefetchApp = () => {
      if (cancelled) return;
      void import("../App");
    };

    if (requestIdle) {
      idleId = requestIdle(prefetchApp, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(prefetchApp, 800);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && cancelIdle) {
        cancelIdle(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
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
        preload="metadata"
        aria-hidden="true"
      >
        <source src="/media/auth-background.mp4" type="video/mp4" />
      </video>
      <div className="auth-shell__scrim" aria-hidden="true" />
      <section className="auth-card liquid-glass">
        <div className="auth-card__content">
          <h1 className="auth-card__title">{title}</h1>
          {children}
          <div className="auth-card__footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}
