import { useEffect, type RefObject } from "react";

const SCROLL_EDGE_EPSILON = 1;

export function useContainedScrollableArea<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const element = ref.current;
    if (!element) return;

    let lastTouchY = 0;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      lastTouchY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      const deltaY = touch.clientY - lastTouchY;
      lastTouchY = touch.clientY;

      const { scrollTop, scrollHeight, clientHeight } = element;
      const canScroll = scrollHeight > clientHeight + SCROLL_EDGE_EPSILON;

      if (!canScroll) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const atTop = scrollTop <= SCROLL_EDGE_EPSILON;
      const atBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_EDGE_EPSILON;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }

      event.stopPropagation();
    };

    const onWheel = (event: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const canScroll = scrollHeight > clientHeight + SCROLL_EDGE_EPSILON;

      if (!canScroll) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const atTop = scrollTop <= SCROLL_EDGE_EPSILON;
      const atBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_EDGE_EPSILON;

      if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
        event.preventDefault();
      }

      event.stopPropagation();
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("wheel", onWheel);
    };
  }, [enabled, ref]);
}
