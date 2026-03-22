interface DesktopWindowHandle {
  isVisible?: () => Promise<boolean>;
  show?: () => Promise<void> | void;
}

declare global {
  interface Window {
    __TAURI__?: {
      webviewWindow?: {
        getCurrentWebviewWindow?: () => DesktopWindowHandle;
      };
      window?: {
        getCurrentWindow?: () => DesktopWindowHandle;
      };
    };
    __XIAOZHUOBAN_DESKTOP_WINDOW_SHOWN__?: boolean;
  }
}

function getDesktopWindowHandle(): DesktopWindowHandle | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tauriWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (tauriWindow) {
    return tauriWindow;
  }

  return window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.() ?? null;
}

export async function showDesktopWindowWhenReady(): Promise<void> {
  if (typeof window === "undefined" || window.__XIAOZHUOBAN_DESKTOP_WINDOW_SHOWN__) {
    return;
  }

  const desktopWindow = getDesktopWindowHandle();
  if (!desktopWindow?.show) {
    return;
  }

  try {
    if (desktopWindow.isVisible && (await desktopWindow.isVisible())) {
      window.__XIAOZHUOBAN_DESKTOP_WINDOW_SHOWN__ = true;
      return;
    }

    await desktopWindow.show();
    window.__XIAOZHUOBAN_DESKTOP_WINDOW_SHOWN__ = true;
  } catch (error) {
    console.warn("[desktopWindow] failed to show window", error);
  }
}
