import { useEffect } from "react";
import type { Board } from "@xiaozhuoban/domain";

interface UseAppBackgroundOptions {
  activeBoard: Board | undefined;
  backgroundColor: string;
}

export function useAppBackground({ activeBoard, backgroundColor }: UseAppBackgroundOptions) {
  useEffect(() => {
    const previousBackground = document.body.style.background;
    const previousBackgroundColor = document.body.style.backgroundColor;
    const previousBackgroundAttachment = document.body.style.backgroundAttachment;
    const previousRootBackgroundColor = document.documentElement.style.backgroundColor;

    if (activeBoard) {
      document.body.style.background = "none";
      document.body.style.backgroundColor = backgroundColor;
      document.body.style.backgroundAttachment = "scroll";
      document.documentElement.style.backgroundColor = backgroundColor;
    }

    return () => {
      document.body.style.background = previousBackground;
      document.body.style.backgroundColor = previousBackgroundColor;
      document.body.style.backgroundAttachment = previousBackgroundAttachment;
      document.documentElement.style.backgroundColor = previousRootBackgroundColor;
    };
  }, [activeBoard, backgroundColor]);
}
