import { useRef, type ChangeEvent } from "react";

const WALLPAPER_MIN_LONG_EDGE = 1600;
const WALLPAPER_MAX_LONG_EDGE = 2560;

async function normalizeWallpaperFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("壁纸加载失败"));
      nextImage.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("无法识别壁纸尺寸");
    }

    const dpr = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const viewportLongEdge =
      typeof window === "undefined"
        ? WALLPAPER_MIN_LONG_EDGE
        : Math.max(window.innerWidth, window.innerHeight) * dpr;
    const targetLongEdge = Math.max(
      WALLPAPER_MIN_LONG_EDGE,
      Math.min(WALLPAPER_MAX_LONG_EDGE, Math.ceil(viewportLongEdge))
    );
    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    const scale = sourceLongEdge > targetLongEdge ? targetLongEdge / sourceLongEdge : 1;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    if (scale === 1) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("壁纸读取失败"));
          }
        };
        reader.onerror = () => reject(new Error("壁纸读取失败"));
        reader.readAsDataURL(file);
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("壁纸处理失败");
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface UseWallpaperUploadOptions {
  setBoardWallpaper: (imageDataUrl: string) => Promise<void>;
}

export function useWallpaperUpload({ setBoardWallpaper }: UseWallpaperUploadOptions) {
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);

  const openWallpaperPicker = () => wallpaperInputRef.current?.click();

  const handleWallpaperInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const result = await normalizeWallpaperFile(file);
        await setBoardWallpaper(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "壁纸导入失败";
        window.alert(message);
      }
    })();
    event.currentTarget.value = "";
  };

  return {
    handleWallpaperInputChange,
    openWallpaperPicker,
    wallpaperInputRef
  };
}
