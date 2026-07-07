import { useEffect, useMemo, useRef, useState } from "react";

const MOBILE_FRAME_WIDTH = 390;
const MOBILE_VIEWPORT_MAX = 900;
const MOBILE_CHROME_IDLE_HIDE_MS = 3000;
const MOBILE_CHROME_SCROLL_THRESHOLD = 6;

function isLikelyMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent);
}

interface UseResponsiveShellOptions {
  hasMobileWidgets: boolean;
}

export function useResponsiveShell({ hasMobileWidgets }: UseResponsiveShellOptions) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileToolbarMenuOpen, setMobileToolbarMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [desktopViewportBottomInset, setDesktopViewportBottomInset] = useState(14);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? MOBILE_FRAME_WIDTH : window.innerWidth
  );
  const mobileChromeHideTimerRef = useRef<number | null>(null);
  const isMobileUa = useMemo(() => isLikelyMobileUA(), []);
  const isMobileMode = isMobileUa || viewportWidth <= MOBILE_VIEWPORT_MAX;
  const mobileChromeLockedVisible = mobileSidebarOpen || mobileToolbarMenuOpen;

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (isMobileMode || !fullscreen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [fullscreen, isMobileMode]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isMobileMode) {
      setDesktopViewportBottomInset(14);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setDesktopViewportBottomInset(14);
      return;
    }

    const syncViewportInset = () => {
      const bottomInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setDesktopViewportBottomInset(bottomInset + 14);
    };

    syncViewportInset();
    viewport.addEventListener("resize", syncViewportInset);
    viewport.addEventListener("scroll", syncViewportInset);
    return () => {
      viewport.removeEventListener("resize", syncViewportInset);
      viewport.removeEventListener("scroll", syncViewportInset);
    };
  }, [isMobileMode]);

  useEffect(() => {
    if (!isMobileMode) {
      setMobileSidebarOpen(false);
      setMobileToolbarMenuOpen(false);
      setMobileChromeVisible(true);
    }
  }, [isMobileMode]);

  useEffect(() => {
    if (!isMobileMode || !hasMobileWidgets || mobileChromeLockedVisible) {
      if (mobileChromeHideTimerRef.current !== null) {
        window.clearTimeout(mobileChromeHideTimerRef.current);
        mobileChromeHideTimerRef.current = null;
      }
      setMobileChromeVisible(true);
      return;
    }

    let lastScrollY = window.scrollY;

    const scheduleHide = () => {
      if (mobileChromeHideTimerRef.current !== null) {
        window.clearTimeout(mobileChromeHideTimerRef.current);
      }
      mobileChromeHideTimerRef.current = window.setTimeout(() => {
        setMobileChromeVisible(false);
        mobileChromeHideTimerRef.current = null;
      }, MOBILE_CHROME_IDLE_HIDE_MS);
    };

    const onScroll = () => {
      const nextScrollY = Math.max(0, window.scrollY);
      const delta = nextScrollY - lastScrollY;
      if (delta >= MOBILE_CHROME_SCROLL_THRESHOLD) {
        setMobileChromeVisible(false);
      } else if (delta <= -MOBILE_CHROME_SCROLL_THRESHOLD) {
        setMobileChromeVisible(true);
      }
      lastScrollY = nextScrollY;
      scheduleHide();
    };

    setMobileChromeVisible(true);
    scheduleHide();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (mobileChromeHideTimerRef.current !== null) {
        window.clearTimeout(mobileChromeHideTimerRef.current);
        mobileChromeHideTimerRef.current = null;
      }
    };
  }, [hasMobileWidgets, isMobileMode, mobileChromeLockedVisible]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!isMobileMode) return;

    let lastTouchEnd = 0;
    const preventGesture = (event: Event) => event.preventDefault();
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const preventDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };
    const preventCtrlZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("touchmove", preventPinch, { passive: false });
    document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
    window.addEventListener("wheel", preventCtrlZoom, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("touchend", preventDoubleTapZoom);
      window.removeEventListener("wheel", preventCtrlZoom);
    };
  }, [isMobileMode]);

  return {
    desktopViewportBottomInset,
    fullscreen,
    isMobileMode,
    mobileChromeVisible,
    mobileSidebarOpen,
    setFullscreen,
    setMobileSidebarOpen,
    setMobileToolbarMenuOpen,
    setSidebarOpen,
    sidebarOpen
  };
}
