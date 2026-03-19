import type { ReactNode } from "react";

type AuthPageShellProps = {
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthPageShell({ title, children, footer }: AuthPageShellProps) {
  return (
    <main className="auth-shell">
      <video
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
