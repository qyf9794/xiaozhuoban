import type { Board } from "@xiaozhuoban/domain";
import defaultAnimatedBackgroundUrl from "../assets/breeze-background.gif";

export const DEFAULT_BOARD_BACKGROUND_COLOR = "#e8ebf0";

export function resolveBoardBackground(background?: Board["background"] | null) {
  if (!background) {
    return {
      type: "image" as const,
      value: defaultAnimatedBackgroundUrl
    };
  }

  if (background.type === "image") {
    return background;
  }

  if (background.value === DEFAULT_BOARD_BACKGROUND_COLOR) {
    return {
      type: "image" as const,
      value: defaultAnimatedBackgroundUrl
    };
  }

  return background;
}

export { defaultAnimatedBackgroundUrl };
