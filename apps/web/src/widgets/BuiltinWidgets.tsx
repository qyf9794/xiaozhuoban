import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Button, Card } from "@xiaozhuoban/ui";
import { WidgetShell } from "./WidgetShell";
import {
  buildDialClockMarkStates,
  DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS,
  getDialClockSweepFrames,
  shouldTriggerDialClockSweep,
  toDialClockTimeState
} from "./dialClockShared";
import { GomokuWidget } from "./GomokuWidget";
import { GuandanWidget } from "./GuandanWidget";
import { MonopolyWidget } from "./MonopolyWidget";
import { DEFAULT_TV_PLAYLIST_URL, parseM3UPlaylist, type TvChannel } from "./tvShared";
import {
  CHINA_TIME_ZONE,
  WORLD_CLOCK_ZONE_OPTIONS,
  formatWorldClockDisplay,
  getRandomWorldClockToneClasses,
  getWorldClockLayoutClass,
  getWorldClockOptionLabel,
  normalizeWorldClockZones,
  toWorldClockSlots,
  updateWorldClockSlot
} from "./worldClockShared";
import { useAuthStore } from "../auth/authStore";
import { supabase } from "../lib/supabase";
import {
  colorForUser,
  MESSAGE_BOARD_CHANNEL,
  normalizeMessageList,
  resolveUserName,
  type MessageBoardItem
} from "../lib/collab";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((i) => typeof i === "string") as string[] : [];
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

const MAJOR_CITIES = [
  { value: "beijing", label: "北京", latitude: 39.9042, longitude: 116.4074 },
  { value: "shanghai", label: "上海", latitude: 31.2304, longitude: 121.4737 },
  { value: "dalian", label: "大连", latitude: 38.914, longitude: 121.6147 },
  { value: "guangzhou", label: "广州", latitude: 23.1291, longitude: 113.2644 },
  { value: "shenzhen", label: "深圳", latitude: 22.5431, longitude: 114.0579 },
  { value: "hangzhou", label: "杭州", latitude: 30.2741, longitude: 120.1551 },
  { value: "chengdu", label: "成都", latitude: 30.5728, longitude: 104.0668 },
  { value: "wuhan", label: "武汉", latitude: 30.5928, longitude: 114.3055 },
  { value: "jingzhou", label: "荆州", latitude: 30.3348, longitude: 112.2407 },
  { value: "chongqing", label: "重庆", latitude: 29.4316, longitude: 106.9123 },
  { value: "nanjing", label: "南京", latitude: 32.0603, longitude: 118.7969 },
  { value: "xian", label: "西安", latitude: 34.3416, longitude: 108.9398 },
  { value: "los-angeles", label: "洛杉矶", latitude: 34.0522, longitude: -118.2437 },
  { value: "boston", label: "波士顿", latitude: 42.3601, longitude: -71.0589 }
] as const;

const GLOBAL_INDICES = [
  { value: "usINX", label: "标普500", marketCode: "usINX" },
  { value: "usNDX", label: "纳斯达克100", marketCode: "usNDX" },
  { value: "usDJI", label: "道琼斯工业", marketCode: "usDJI" },
  { value: "hkHSI", label: "恒生指数", marketCode: "hkHSI" },
  { value: "sh000001", label: "上证指数", marketCode: "sh000001" },
  { value: "sz399001", label: "深证成指", marketCode: "sz399001" }
] as const;

const TRANSLATE_LANG_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "英文" }
] as const;

const CONVERTER_CATEGORY_OPTIONS = [
  { value: "length", label: "长度" },
  { value: "weight", label: "重量" },
  { value: "temperature", label: "温度" }
] as const;

const DIAL_CLOCK_NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const DIAL_CLOCK_HOURLY_AUDIO_SRC = "/media/dial-clock-hourly.wav";
const DIAL_CLOCK_HOURLY_AUDIO_FALLBACK_DURATION_MS = 12_341;
const DIAL_CLOCK_HOURLY_AUDIO_DELAY_MS = 1000;

function DialClockMoonIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="dial-clock-icon-svg">
      <path
        d="M14.9 4.8a7.2 7.2 0 1 0 4.3 12.9 6.6 6.6 0 0 1-2.4.4c-3.9 0-7.1-3.1-7.1-7 0-2.4 1.2-4.6 3.2-5.9 0 0 1.2-.8 2-.4Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DialClockSunIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="dial-clock-icon-svg">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 3.8v2.1M12 18.1v2.1M20.2 12h-2.1M5.9 12H3.8M17.8 6.2l-1.5 1.5M7.7 16.3l-1.5 1.5M17.8 17.8l-1.5-1.5M7.7 7.7 6.2 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type GlassSelectOption = { value: string; label: string };

function GlassSelect({
  value,
  options,
  onChange,
  style,
  menuWidth,
  buttonStyle
}: {
  value: string;
  options: GlassSelectOption[];
  onChange: (next: string) => void;
  style?: CSSProperties;
  menuWidth?: number | string;
  buttonStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevWidgetZRef = useRef<string>("");
  const selected = options.find((item) => item.value === value) ?? options[0];

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const widgetBox = root.closest(".widget-box") as HTMLElement | null;
    if (!widgetBox) return;
    if (open) {
      prevWidgetZRef.current = widgetBox.style.zIndex || "";
      widgetBox.style.zIndex = "99990";
    } else if (prevWidgetZRef.current !== "") {
      widgetBox.style.zIndex = prevWidgetZRef.current;
      prevWidgetZRef.current = "";
    }
    return () => {
      if (prevWidgetZRef.current !== "") {
        widgetBox.style.zIndex = prevWidgetZRef.current;
        prevWidgetZRef.current = "";
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updateMenuPosition = () => {
      const root = rootRef.current;
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!root || !button || !panel) return;
      const rootRect = root.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const viewportPadding = 8;
      const preferredWidth =
        typeof menuWidth === "number"
          ? menuWidth
          : typeof menuWidth === "string" && menuWidth.trim() && menuWidth !== "100%"
            ? Number.parseFloat(menuWidth)
            : buttonRect.width;
      const nextWidth = Math.min(
        Math.max(Number.isFinite(preferredWidth) ? preferredWidth : buttonRect.width, buttonRect.width),
        window.innerWidth - viewportPadding * 2
      );
      panel.style.width = `${nextWidth}px`;
      panel.style.minWidth = `${Math.min(buttonRect.width, nextWidth)}px`;

      const panelHeight = panel.offsetHeight;
      const canOpenBelow = buttonRect.bottom + 6 + panelHeight <= window.innerHeight - viewportPadding;
      const canOpenAbove = buttonRect.top - 6 - panelHeight >= viewportPadding;
      const top = canOpenBelow || !canOpenAbove ? rootRect.height + 6 : -panelHeight - 6;

      let left = 0;
      if (rootRect.left + nextWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - viewportPadding - rootRect.left - nextWidth;
      }
      if (rootRect.left + left < viewportPadding) {
        left = viewportPadding - rootRect.left;
      }

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.style.right = "auto";
    };

    const rafId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuWidth, open, options.length]);

  return (
    <div ref={rootRef} style={{ position: "relative", ...style }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          minHeight: 34,
          borderRadius: 12,
          border: "1px solid rgba(203, 213, 225, 0.65)",
          padding: "6px 28px 6px 10px",
          color: "#0f172a",
          lineHeight: 1.35,
          textAlign: "left",
          cursor: "pointer",
          background: "linear-gradient(160deg, rgba(255,255,255,0.68), rgba(255,255,255,0.36))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 12px rgba(15,23,42,0.06)",
          fontSize: 12,
          position: "relative",
          ...buttonStyle
        }}
      >
        {selected?.label ?? ""}
        <span
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#64748b",
            fontSize: 11
          }}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="glass-dropdown-panel"
          style={{
            position: "absolute",
            top: 36,
            left: 0,
            width: typeof menuWidth === "number" ? menuWidth : "100%",
            minWidth: "100%",
            padding: 4,
            zIndex: 99991,
            maxHeight: 260,
            overflowY: "auto"
          }}
        >
          {options.map((item) => (
            <button
              key={item.value}
              type="button"
              className="glass-dropdown-item"
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
              style={{
                background: item.value === value ? "rgba(148,163,184,0.18)" : "transparent"
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const CONVERTER_UNIT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  length: [
    { value: "m", label: "米(m)" },
    { value: "km", label: "千米(km)" },
    { value: "cm", label: "厘米(cm)" },
    { value: "inch", label: "英寸(in)" },
    { value: "ft", label: "英尺(ft)" }
  ],
  weight: [
    { value: "kg", label: "千克(kg)" },
    { value: "g", label: "克(g)" },
    { value: "lb", label: "磅(lb)" },
    { value: "oz", label: "盎司(oz)" }
  ],
  temperature: [
    { value: "c", label: "摄氏(°C)" },
    { value: "f", label: "华氏(°F)" },
    { value: "k", label: "开尔文(K)" }
  ]
};

function convertUnit(value: number, category: string, from: string, to: string): number {
  if (from === to) return value;

  if (category === "length") {
    const toMeter: Record<string, number> = {
      m: 1,
      km: 1000,
      cm: 0.01,
      inch: 0.0254,
      ft: 0.3048
    };
    const meter = value * (toMeter[from] ?? 1);
    return meter / (toMeter[to] ?? 1);
  }

  if (category === "weight") {
    const toKg: Record<string, number> = {
      kg: 1,
      g: 0.001,
      lb: 0.45359237,
      oz: 0.028349523125
    };
    const kg = value * (toKg[from] ?? 1);
    return kg / (toKg[to] ?? 1);
  }

  if (category === "temperature") {
    const toCelsius = (n: number, unit: string): number => {
      if (unit === "c") return n;
      if (unit === "f") return (n - 32) * (5 / 9);
      if (unit === "k") return n - 273.15;
      return n;
    };
    const fromCelsius = (n: number, unit: string): number => {
      if (unit === "c") return n;
      if (unit === "f") return n * (9 / 5) + 32;
      if (unit === "k") return n + 273.15;
      return n;
    };
    return fromCelsius(toCelsius(value, from), to);
  }

  return value;
}

async function quickTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const input = text.trim();
  if (!input) return "";
  const inferredSourceLang =
    sourceLang === "auto"
      ? /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(input)
        ? "zh-CN"
        : "en"
      : sourceLang;
  const langpair = `${inferredSourceLang}|${targetLang}`;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", input);
  url.searchParams.set("langpair", langpair);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`翻译失败 (${response.status})`);
  }
  const payload = (await response.json()) as {
    responseStatus?: number;
    responseDetails?: string;
    responseData?: { translatedText?: string };
  };
  if (payload.responseStatus && payload.responseStatus !== 200) {
    throw new Error(payload.responseDetails || "翻译失败");
  }
  const translated = payload.responseData?.translatedText?.trim();
  if (!translated) {
    throw new Error("未获取到翻译结果");
  }
  return translated;
}

function weatherCodeToText(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2].includes(code)) return "少云";
  if (code === 3) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷暴";
  return "未知";
}

function weatherCodeToIcon(code: number, isDay: boolean): string {
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code === 0) return isDay ? "☀️" : "🌙";
  if ([1, 2, 3].includes(code)) return "⛅";
  return "🌤️";
}

type WeatherForecastDay = {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
};

function formatForecastDayLabel(date: string, index: number): string {
  if (index === 0) return "明天";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "--";
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

async function searchITunesTracks(term: string): Promise<ITunesTrack[]> {
  const query = term.trim();
  if (!query) return [];
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "20");
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`搜索失败 (${response.status})`);
  }
  const payload = (await response.json()) as { results?: ITunesTrack[] };
  return (payload.results ?? []).filter((item) => Boolean(item.previewUrl));
}

interface MarketSeries {
  points: number[];
  last: number;
  prev: number;
  intraday: Array<{ t: number; v: number }>;
  sessionStart: string;
  sessionEnd: string;
}

interface HeadlineItem {
  id: string;
  title: string;
  translatedTitle?: string;
  url: string;
  source: string;
  time: string;
}

const headlineTranslationCache = new Map<string, Promise<string> | string>();

function formatPublishedTime(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(value)) {
    // Source already provides local publish timestamp.
    return value.slice(5, 16);
  }
  if (/^\d{10,13}$/.test(value)) {
    const ts = Number(value);
    if (Number.isFinite(ts)) {
      const date = new Date(value.length === 13 ? ts : ts * 1000);
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed);
  }
  return "";
}

async function fetchMarketSeries(marketCode: string): Promise<MarketSeries> {
  const toMinute = (hhmm: string): number | null => {
    if (!/^\d{4}$/.test(hhmm)) return null;
    const h = Number(hhmm.slice(0, 2));
    const m = Number(hhmm.slice(2, 4));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const getSession = (
    code: string
  ): {
    start: string;
    end: string;
  } => {
    if (code.startsWith("sh") || code.startsWith("sz")) return { start: "0930", end: "1500" };
    if (code.startsWith("hk")) return { start: "0930", end: "1600" };
    return { start: "0930", end: "1600" };
  };
  const getTimeZone = (code: string): string => {
    if (code.startsWith("sh") || code.startsWith("sz")) return "Asia/Shanghai";
    if (code.startsWith("hk")) return "Asia/Hong_Kong";
    return "America/New_York";
  };
  const isTradingTimeNow = (code: string, start: string, end: string): boolean => {
    const timeZone = getTimeZone(code);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    const minuteOfDay = hour * 60 + minute;
    const startMinute = toMinute(start) ?? 570;
    const endMinute = toMinute(end) ?? 960;
    const isWeekday = !["Sat", "Sun"].includes(weekday);
    return isWeekday && minuteOfDay >= startMinute && minuteOfDay <= endMinute;
  };
  const parseMinuteLines = (lines: string[]): Array<{ t: number; v: number }> =>
    lines
      .map((line) => {
        const [time, price] = line.trim().split(/\s+/);
        return { t: toMinute(time), v: Number(price) };
      })
      .filter((item) => item.t !== null && Number.isFinite(item.v) && item.v > 0) as Array<{ t: number; v: number }>;
  const readIntradayNode = async (
    urls: string[]
  ): Promise<{ lines: string[]; qt: Record<string, unknown> | undefined }> => {
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as {
        code?: number;
        data?: Record<string, { data?: { data?: string[] }; qt?: Record<string, unknown> }>;
      };
      if (payload.code !== 0 || !payload.data) {
        continue;
      }
      const node =
        payload.data[marketCode] ??
        Object.values(payload.data).find((item) => item && typeof item === "object" && "data" in item);
      if (!node) {
        continue;
      }
      const lines = Array.isArray(node.data?.data) ? node.data.data ?? [] : [];
      return { lines, qt: node.qt };
    }
    throw new Error("指数数据不可用");
  };
  const fetchRecentSessionLines = async (): Promise<string[]> => {
    if (marketCode.startsWith("us")) {
      const { lines } = await readIntradayNode([
        `https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code=${encodeURIComponent(marketCode)}`
      ]);
      return lines;
    }
    const response = await fetch(
      `https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${encodeURIComponent(marketCode)}`
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      code?: number;
      data?: Record<string, { data?: Array<{ date?: string; data?: string[] }> }>;
    };
    const node = payload.data?.[marketCode];
    const latest = Array.isArray(node?.data) ? node.data[node.data.length - 1] : undefined;
    return Array.isArray(latest?.data) ? latest.data : [];
  };

  const intradayNode = await readIntradayNode(
    marketCode.startsWith("us")
      ? [
          `https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code=${encodeURIComponent(marketCode)}`,
          `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(marketCode)}`
        ]
      : [`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(marketCode)}`]
  );
  const minuteLines = intradayNode.lines;
  let pointSeries = parseMinuteLines(minuteLines);

  const qtRaw = intradayNode.qt?.[marketCode];
  const qtArray = Array.isArray(qtRaw) ? qtRaw : [];
  const lastFromQt = Number(qtArray[3]);
  const prevFromQt = Number(qtArray[4]);

  let dayRows: string[][] = [];
  const dailyUrls = [
    `https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get?param=${encodeURIComponent(marketCode)},day,,,40,qfq`,
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(marketCode)},day,,,40,qfq`
  ];
  for (const dailyUrl of dailyUrls) {
    const dailyResponse = await fetch(dailyUrl);
    if (!dailyResponse.ok) {
      continue;
    }
    const dailyPayload = (await dailyResponse.json()) as {
      code?: number;
      data?: Record<string, { day?: string[][] }>;
    };
    const rows = dailyPayload.data?.[marketCode]?.day ?? [];
    if (rows.length > 0) {
      dayRows = rows;
      break;
    }
  }

  if (pointSeries.length < 2) {
    const dayPoints = dayRows.map((row) => Number(row[2])).filter((value) => Number.isFinite(value) && value > 0);
    if (dayPoints.length >= 2) {
      pointSeries = dayPoints.slice(-40).map((value, index) => ({
        t: index,
        v: value
      }));
    }
  }

  if (pointSeries.length < 2) {
    throw new Error("指数数据不足");
  }

  const last =
    Number.isFinite(lastFromQt) && lastFromQt > 0 ? lastFromQt : pointSeries[pointSeries.length - 1].v;
  const prev =
    Number.isFinite(prevFromQt) && prevFromQt > 0
      ? prevFromQt
      : pointSeries.length >= 2
        ? pointSeries[pointSeries.length - 2].v
        : last;

  const session = getSession(marketCode);
  const startMin = toMinute(session.start) ?? 570;
  const endMin = toMinute(session.end) ?? 960;
  const liveIntraday = pointSeries.filter((item) => item.t >= startMin && item.t <= endMin);
  const inTradingNow = isTradingTimeNow(marketCode, session.start, session.end);

  let intraday = liveIntraday;
  if (!inTradingNow && intraday.length < 2) {
    const recentSessionLines = await fetchRecentSessionLines();
    const recentSessionSeries = parseMinuteLines(recentSessionLines).filter((item) => item.t >= startMin && item.t <= endMin);
    if (recentSessionSeries.length >= 2) {
      intraday = recentSessionSeries;
    }
  }
  if (!inTradingNow && intraday.length < 2 && dayRows.length > 0) {
    const prevRow = dayRows[dayRows.length - 1];
    const dayOpen = Number(prevRow?.[1]);
    const dayClose = Number(prevRow?.[2]);
    const dayHigh = Number(prevRow?.[3]);
    const dayLow = Number(prevRow?.[4]);
    const valid = [dayOpen, dayClose, dayHigh, dayLow].every((n) => Number.isFinite(n) && n > 0);
    if (valid) {
      const span = Math.max(1, endMin - startMin);
      intraday = [
        { t: startMin, v: dayOpen },
        { t: startMin + Math.round(span * 0.33), v: dayHigh },
        { t: startMin + Math.round(span * 0.66), v: dayLow },
        { t: endMin, v: dayClose }
      ];
    }
  }
  return {
    points: pointSeries.map((item) => item.v),
    last,
    prev,
    intraday,
    sessionStart: session.start,
    sessionEnd: session.end
  };
}

async function fetchMajorHeadlines(): Promise<HeadlineItem[]> {
  const fromRss = async (rssUrl: string, fallbackSource: string): Promise<HeadlineItem[]> => {
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`RSS请求失败 (${response.status})`);
    }
    const payload = (await response.json()) as {
      status?: string;
      items?: Array<{ title?: string; link?: string; pubDate?: string; author?: string }>;
    };
    if (payload.status !== "ok") {
      throw new Error("RSS服务返回异常");
    }
    return (payload.items ?? [])
      .map((item, index) => {
        const title = (item.title ?? "").trim();
        const url = (item.link ?? "").trim();
        if (!title || !url) return null;
        return {
          id: `rss_${index}_${Date.now()}`,
          title,
          url,
          source: item.author || fallbackSource,
          time: item.pubDate || ""
        } satisfies HeadlineItem;
      })
      .filter((item): item is HeadlineItem => item !== null)
      .slice(0, 12);
  };

  const feeds = await Promise.allSettled([
    fromRss("https://feeds.skynews.com/feeds/rss/world.xml", "Sky News"),
    fromRss("https://feeds.bloomberg.com/markets/news.rss", "Bloomberg"),
    fromRss("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC")
  ]);

  const merged = feeds
    .filter((result): result is PromiseFulfilledResult<HeadlineItem[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const deduped = merged.filter((item, index, list) => {
    const key = `${item.title}::${item.url}`;
    return list.findIndex((candidate) => `${candidate.title}::${candidate.url}` === key) === index;
  });

  const sorted = deduped.sort((a, b) => {
    const timeA = Date.parse(a.time || "");
    const timeB = Date.parse(b.time || "");
    if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0;
    if (Number.isNaN(timeA)) return 1;
    if (Number.isNaN(timeB)) return -1;
    return timeB - timeA;
  });

  if (sorted.length > 0) {
    return sorted.slice(0, 12);
  }

  throw new Error("Sky News/Bloomberg/BBC 新闻源暂无可用数据");
}

async function translateHeadlineTitle(title: string): Promise<string> {
  const input = title.trim();
  if (!input) return "";
  if (/[\u3400-\u9fff]/.test(input)) {
    return input;
  }

  const cached = headlineTranslationCache.get(input);
  if (typeof cached === "string") {
    return cached;
  }
  if (cached) {
    return cached;
  }

  const request = quickTranslate(input, "en", "zh-CN")
    .then((translated) => {
      headlineTranslationCache.set(input, translated);
      return translated;
    })
    .catch(() => {
      headlineTranslationCache.set(input, "");
      return "";
    });

  headlineTranslationCache.set(input, request);
  return request;
}

async function fetchLocalizedHeadlines(): Promise<HeadlineItem[]> {
  const headlines = await fetchMajorHeadlines();
  return Promise.all(
    headlines.map(async (item) => ({
      ...item,
      translatedTitle: await translateHeadlineTitle(item.title)
    }))
  );
}

function sortHeadlinesByTime(items: HeadlineItem[]): HeadlineItem[] {
  return [...items].sort((a, b) => {
    const timeA = Date.parse(a.time || "");
    const timeB = Date.parse(b.time || "");
    if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0;
    if (Number.isNaN(timeA)) return 1;
    if (Number.isNaN(timeB)) return -1;
    return timeB - timeA;
  });
}

function mergeLatestHeadline(current: HeadlineItem[], incoming: HeadlineItem[]): HeadlineItem[] {
  const currentOrdered = current.slice(0, 5);
  const incomingSorted = sortHeadlinesByTime(incoming);

  if (currentOrdered.length === 0) {
    return incomingSorted.slice(0, 5);
  }

  const currentKeys = new Set(currentOrdered.map((item) => `${item.title}::${item.url}`));
  const newestIncoming = incomingSorted.find((item) => !currentKeys.has(`${item.title}::${item.url}`));

  if (!newestIncoming) {
    return currentOrdered;
  }

  const merged = [newestIncoming, ...currentOrdered];
  const deduped = merged.filter((item, index, list) => {
    const key = `${item.title}::${item.url}`;
    return list.findIndex((candidate) => `${candidate.title}::${candidate.url}` === key) === index;
  });

  return deduped.slice(0, 5);
}

interface TodoItem {
  id: string;
  text: string;
  dueAt?: string;
}

function normalizeTodoItems(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<TodoItem>;
      const text = typeof candidate.text === "string" ? candidate.text : "";
      if (!text.trim()) return null;
      const dueAt = typeof candidate.dueAt === "string" ? candidate.dueAt : undefined;
      const fallbackId = `todo_${index}_${text}_${dueAt ?? ""}`;
      return {
        id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : fallbackId,
        text,
        dueAt
      } as TodoItem;
    })
    .filter((item): item is TodoItem => item !== null);
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "已到期";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function clampCountdownSegment(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value)));
}

function getCountdownInputValue(raw: unknown, fallback: number): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.max(0, Math.floor(raw)));
  return String(fallback);
}

function parseCountdownInputValue(raw: unknown, max: number, fallback = 0): number {
  if (typeof raw === "number") {
    return clampCountdownSegment(raw, max);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    const normalized = Number.parseInt(trimmed, 10);
    return clampCountdownSegment(normalized, max);
  }
  return fallback;
}

interface RecordingItem {
  id: string;
  createdAt: string;
  name?: string;
  dataUrl: string;
  mimeType: string;
}

type RecorderWakeLockSentinel = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type RecorderWakeLockApi = {
  request: (type: "screen") => Promise<RecorderWakeLockSentinel>;
};

interface ClipboardRecord {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
}

interface MessageBoardRow {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

let messageBoardAudioContext: AudioContext | null = null;
let messageBoardHistoryPromise: Promise<MessageBoardItem[]> | null = null;
let messageBoardHistoryCache: MessageBoardItem[] | null = null;
let messageBoardHistoryCacheExpiresAt = 0;

function getScreenWakeLockApi(): RecorderWakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { wakeLock?: RecorderWakeLockApi }).wakeLock;
  return candidate ?? null;
}

async function getMessageBoardAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!messageBoardAudioContext) {
    messageBoardAudioContext = new AudioContextCtor();
  }
  const ctx = messageBoardAudioContext;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}

function messageFromRow(row: MessageBoardRow): MessageBoardItem {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.message,
    createdAt: row.created_at
  };
}

async function fetchMessageBoardHistory(): Promise<MessageBoardItem[]> {
  if (messageBoardHistoryCache && Date.now() < messageBoardHistoryCacheExpiresAt) {
    return messageBoardHistoryCache;
  }

  if (messageBoardHistoryPromise) {
    return messageBoardHistoryPromise;
  }

  messageBoardHistoryPromise = (async () => {
    const { data, error } = await supabase
      .from("message_board_messages")
      .select("id,sender_id,sender_name,message,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const nextHistory = ((data as MessageBoardRow[] | null) ?? []).map(messageFromRow);
    messageBoardHistoryCache = nextHistory;
    messageBoardHistoryCacheExpiresAt = Date.now() + 1000;
    return nextHistory;
  })();

  try {
    return await messageBoardHistoryPromise;
  } finally {
    messageBoardHistoryPromise = null;
  }
}

async function playMessageBoardChime() {
  const ctx = await getMessageBoardAudioContext();
  if (!ctx) return;

  const startAt = ctx.currentTime + 0.01;
  const duration = 0.22;
  const gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.14, startAt + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  const first = ctx.createOscillator();
  first.type = "triangle";
  first.frequency.setValueAtTime(880, startAt);
  first.connect(gainNode);
  first.start(startAt);
  first.stop(startAt + 0.09);

  const second = ctx.createOscillator();
  second.type = "triangle";
  second.frequency.setValueAtTime(1318, startAt + 0.1);
  second.connect(gainNode);
  second.start(startAt + 0.1);
  second.stop(startAt + duration);
}

async function primeMessageBoardAudio() {
  const ctx = await getMessageBoardAudioContext();
  if (!ctx) return;
  const startAt = ctx.currentTime + 0.005;
  const gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);
  gainNode.gain.setValueAtTime(0.00001, startAt);
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, startAt);
  oscillator.connect(gainNode);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.01);
}

async function playCountdownAlarm() {
  const ctx = await getMessageBoardAudioContext();
  if (!ctx) return;

  const gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);

  const notes = [
    { at: 0.0, duration: 0.24, frequency: 880 },
    { at: 0.28, duration: 0.24, frequency: 1046.5 },
    { at: 0.56, duration: 0.3, frequency: 1318.5 },
    { at: 0.9, duration: 0.42, frequency: 1046.5 }
  ] as const;

  for (let round = 0; round < 2; round += 1) {
    for (const note of notes) {
      const startAt = ctx.currentTime + 0.01 + round * 1.45 + note.at;
      const endAt = startAt + note.duration;
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      oscillator.connect(gainNode);
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.16, startAt + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.start(startAt);
      oscillator.stop(endAt);
    }
  }
}

async function playDialClockHourlyAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    console.warn("[dialClock] hourly audio failed", error);
  }
}

function normalizeClipboardRecords(raw: unknown): ClipboardRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `clip_${Date.now()}_${index}`,
          text: item,
          pinned: false,
          createdAt: new Date(Date.now() - index).toISOString()
        } satisfies ClipboardRecord;
      }
      if (item && typeof item === "object") {
        const candidate = item as Partial<ClipboardRecord>;
        const text = typeof candidate.text === "string" ? candidate.text : "";
        if (!text.trim()) return null;
        return {
          id: typeof candidate.id === "string" ? candidate.id : `clip_${Date.now()}_${index}`,
          text,
          pinned: candidate.pinned === true,
          createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(Date.now() - index).toISOString()
        } satisfies ClipboardRecord;
      }
      return null;
    })
    .filter((item): item is ClipboardRecord => Boolean(item));
}

function trimUnpinnedRecords(records: ClipboardRecord[], maxUnpinned = 30): ClipboardRecord[] {
  const next = [...records];
  let unpinnedCount = next.filter((item) => !item.pinned).length;
  if (unpinnedCount <= maxUnpinned) return next;
  for (let i = next.length - 1; i >= 0 && unpinnedCount > maxUnpinned; i -= 1) {
    if (!next[i].pinned) {
      next.splice(i, 1);
      unpinnedCount -= 1;
    }
  }
  return next;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("音频转换失败"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("音频读取失败"));
    reader.readAsDataURL(blob);
  });
}

function ComposedInput({
  value,
  placeholder,
  onCommit,
  multiline = false,
  style
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current) {
      setDraft(value);
    }
  }, [value]);

  const commonStyle: CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(203, 213, 225, 0.65)",
    padding: "6px 8px",
    background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
  };

  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (!composing.current) {
            onCommit(next);
          }
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          const next = event.currentTarget.value;
          setDraft(next);
          onCommit(next);
        }}
        style={{ ...commonStyle, minHeight: 110, ...style }}
      />
    );
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (!composing.current) {
          onCommit(next);
        }
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        const next = event.currentTarget.value;
        setDraft(next);
        onCommit(next);
      }}
      style={{ ...commonStyle, ...style }}
    />
  );
}

function VerticalResizableTextarea({
  value,
  onCommit,
  placeholder,
  readOnly = false,
  minHeight = 74,
  height,
  onHeightCommit,
  autoSize = false,
  style
}: {
  value: string;
  onCommit?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
  height: number;
  onHeightCommit: (height: number) => void;
  autoSize?: boolean;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  const [liveHeight, setLiveHeight] = useState(Math.max(minHeight, height));
  const heightRef = useRef(Math.max(minHeight, height));
  const dragRef = useRef<null | { startY: number; startHeight: number }>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!composingRef.current) {
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    const nextHeight = Math.max(minHeight, height);
    setLiveHeight(nextHeight);
    heightRef.current = nextHeight;
    if (textareaRef.current) {
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [height, minHeight]);

  useEffect(() => {
    if (!autoSize || !textareaRef.current) {
      return;
    }
    const textarea = textareaRef.current;
    textarea.style.height = "0px";
    const nextHeight = Math.max(minHeight, textarea.scrollHeight);
    textarea.style.height = `${nextHeight}px`;
    if (heightRef.current !== nextHeight) {
      heightRef.current = nextHeight;
      setLiveHeight(nextHeight);
      onHeightCommit(nextHeight);
    } else if (liveHeight !== nextHeight) {
      setLiveHeight(nextHeight);
    }
  }, [autoSize, draft, liveHeight, minHeight, onHeightCommit]);

  useEffect(() => {
    if (autoSize) {
      return;
    }
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const nextHeight = Math.max(minHeight, drag.startHeight + (event.clientY - drag.startY));
      heightRef.current = nextHeight;
      if (textareaRef.current) {
        textareaRef.current.style.height = `${nextHeight}px`;
      }
      setLiveHeight(nextHeight);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onHeightCommit(heightRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [autoSize, minHeight, onHeightCommit]);

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={textareaRef}
        readOnly={readOnly}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (!readOnly && !composingRef.current) {
            onCommit?.(next);
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          const next = event.currentTarget.value;
          setDraft(next);
          if (!readOnly) {
            onCommit?.(next);
          }
        }}
        style={{
          width: "100%",
          maxWidth: "100%",
          minHeight,
          height: liveHeight,
          resize: "none",
          overflow: "auto",
          ...style
        }}
      />
      {autoSize ? null : (
        <div
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = { startY: event.clientY, startHeight: heightRef.current };
          }}
          data-no-drag="true"
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 1,
            height: 10,
            cursor: "ns-resize"
          }}
          title="拖拽调整高度"
        />
      )}
    </div>
  );
}

export function BuiltinWidgetView({
  definition,
  instance,
  isMobileMode = false,
  onStateChange
}: {
  definition: WidgetDefinition;
  instance: WidgetInstance;
  isMobileMode?: boolean;
  onStateChange: (nextState: Record<string, unknown>) => void;
}) {
  if (definition.type === "note") {
    const noteText = asString(instance.state.content);
    const noteHeight = Number(instance.state.noteHeight ?? 110);

    return (
      <WidgetShell
        definition={definition}
        instance={instance}
        cardStyle={{
          height: "auto",
          minHeight: 0
        }}
      >
        <VerticalResizableTextarea
          value={noteText}
          onCommit={(next) => onStateChange({ ...instance.state, content: next })}
          placeholder="在这里记录你的想法..."
          minHeight={90}
          height={noteHeight}
          onHeightCommit={(nextHeight) => onStateChange({ ...instance.state, noteHeight: nextHeight })}
          autoSize
          style={{
            borderRadius: 12,
            border: "1px solid rgba(250, 204, 21, 0.5)",
            padding: "6px 8px",
            background: "linear-gradient(165deg, rgba(255, 247, 196, 0.68), rgba(255, 233, 133, 0.46))",
            marginBottom: 0
          }}
        />
      </WidgetShell>
    );
  }

  if (definition.type === "todo") {
    const items = normalizeTodoItems(instance.state.items);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }, []);
    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <ComposedInput
            value={asString(instance.state.input)}
            onCommit={(next) => onStateChange({ ...instance.state, input: next })}
            placeholder="添加任务"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr", gap: 6 }}>
            <input
              type="date"
              value={asString(instance.state.inputDate)}
              onChange={(event) => onStateChange({ ...instance.state, inputDate: event.target.value })}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                minWidth: 0,
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
            <input
              type="time"
              value={asString(instance.state.inputTime)}
              onChange={(event) => onStateChange({ ...instance.state, inputTime: event.target.value })}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                minWidth: 0,
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              onClick={() => {
                const text = asString(instance.state.input).trim();
                if (!text) {
                  return;
                }
                const date = asString(instance.state.inputDate);
                const time = asString(instance.state.inputTime);
                const dueAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : undefined;
                onStateChange({
                  ...instance.state,
                  items: [...items, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text, dueAt }],
                  input: "",
                  inputDate: "",
                  inputTime: ""
                });
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1, display: "inline-block" }}>+</span>
            </Button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => {
            const editingId = asString(instance.state.editingTodoId);
            const isEditing = editingId === item.id;
            const remainingMs = item.dueAt ? new Date(item.dueAt).getTime() - now : null;

            return (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 8,
                  alignItems: "start",
                  padding: "6px 8px",
                  borderRadius: 10,
                  border: "1px solid rgba(203, 213, 225, 0.55)",
                  background: "linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0.3))",
                  minWidth: 0
                }}
              >
                <button
                  onClick={() => {
                    onStateChange({ ...instance.state, items: items.filter((t) => t.id !== item.id) });
                  }}
                  title="完成"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "2px solid #0ea5e9",
                    background: "transparent",
                    cursor: "pointer"
                  }}
                />

                <div style={{ minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={asString(instance.state.editingTodoText)}
                      onChange={(event) => onStateChange({ ...instance.state, editingTodoText: event.target.value })}
                      onBlur={() => {
                        const nextText = asString(instance.state.editingTodoText).trim();
                        onStateChange({
                          ...instance.state,
                          editingTodoId: "",
                          editingTodoText: "",
                          items: items.map((t) => (t.id === item.id && nextText ? { ...t, text: nextText } : t))
                        });
                      }}
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: "1px solid rgba(203, 213, 225, 0.65)",
                        padding: "4px 6px",
                        minWidth: 0
                      }}
                    />
                  ) : (
                    <div style={{ minWidth: 0 }}>
                      <div
                        onDoubleClick={() => {
                          onStateChange({
                            ...instance.state,
                            editingTodoId: item.id,
                            editingTodoText: item.text
                          });
                        }}
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
                        title="双击编辑"
                      >
                        {item.text}
                      </div>
                      <small style={{ color: "#64748b", display: "block", overflowWrap: "anywhere" }}>
                        {item.dueAt
                          ? `截止 ${new Date(item.dueAt).toLocaleString()} · ${fmtRemaining(remainingMs ?? 0)}`
                          : "未设置截止时间"}
                      </small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "calculator") {
    const display = typeof instance.state.calcDisplay === "string" ? instance.state.calcDisplay : "0";
    const acc = typeof instance.state.calcAcc === "number" ? instance.state.calcAcc : null;
    const op = typeof instance.state.calcOp === "string" ? instance.state.calcOp : null;
    const resetOnInput = instance.state.calcResetOnInput === true;

    const applyOp = (left: number, right: number, operator: string): number => {
      if (operator === "+") return left + right;
      if (operator === "-") return left - right;
      if (operator === "×") return left * right;
      if (operator === "÷") return right === 0 ? 0 : left / right;
      return right;
    };

    const write = (next: Record<string, unknown>) => onStateChange({ ...instance.state, ...next });

    const onDigit = (digit: string) => {
      if (resetOnInput || display === "0") {
        write({ calcDisplay: digit, calcResetOnInput: false });
        return;
      }
      write({ calcDisplay: `${display}${digit}` });
    };

    const onOperator = (nextOp: string) => {
      const current = Number(display);
      if (acc === null || !op) {
        write({ calcAcc: current, calcOp: nextOp, calcResetOnInput: true });
        return;
      }
      const result = applyOp(acc, current, op);
      write({
        calcAcc: result,
        calcOp: nextOp,
        calcDisplay: String(Number(result.toFixed(10))),
        calcResetOnInput: true
      });
    };

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div
          style={{
            textAlign: "right",
            fontSize: 28,
            fontWeight: 600,
            color: "#0f172a",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 8,
            border: "1px solid rgba(255,255,255,0.58)",
            background: "linear-gradient(160deg, rgba(255,255,255,0.54), rgba(255,255,255,0.28))"
          }}
        >
          {display}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {["C", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="].map(
            (key) => {
              const isOp = ["÷", "×", "-", "+", "="].includes(key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (key === "C") {
                      write({ calcDisplay: "0", calcAcc: null, calcOp: null, calcResetOnInput: false });
                      return;
                    }
                    if (key === "±") {
                      const flipped = Number(display) * -1;
                      write({ calcDisplay: String(flipped) });
                      return;
                    }
                    if (key === "%") {
                      write({ calcDisplay: String(Number(display) / 100) });
                      return;
                    }
                    if (key === ".") {
                      if (!display.includes(".")) {
                        write({ calcDisplay: `${display}.` });
                      }
                      return;
                    }
                    if (key === "=") {
                      if (acc !== null && op) {
                        const result = applyOp(acc, Number(display), op);
                        write({
                          calcDisplay: String(Number(result.toFixed(10))),
                          calcAcc: null,
                          calcOp: null,
                          calcResetOnInput: true
                        });
                      }
                      return;
                    }
                    if (["÷", "×", "-", "+"].includes(key)) {
                      onOperator(key);
                      return;
                    }
                    onDigit(key);
                  }}
                  style={{
                    gridColumn: key === "0" ? "span 2" : "span 1",
                    borderRadius: 10,
                    border: isOp
                      ? "1px solid rgba(96, 165, 250, 0.62)"
                      : "1px solid rgba(148, 163, 184, 0.42)",
                    background: isOp
                      ? "linear-gradient(160deg, rgba(37, 99, 235, 0.82), rgba(56, 189, 248, 0.72))"
                      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.3))",
                    color: isOp ? "#eff6ff" : "#0f172a",
                    fontSize: isOp ? 20 : 14,
                    fontWeight: isOp ? 700 : 500,
                    minHeight: 34,
                    cursor: "pointer"
                  }}
                >
                  {key}
                </button>
              );
            }
          )}
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "countdown") {
    const inputHoursValue = getCountdownInputValue(instance.state.inputHours, 0);
    const inputMinutesValue = getCountdownInputValue(instance.state.inputMinutes, 0);
    const inputSecondsValue = getCountdownInputValue(instance.state.inputSeconds, 0);
    const inputHours = parseCountdownInputValue(instance.state.inputHours, 99);
    const inputMinutes = parseCountdownInputValue(instance.state.inputMinutes, 59, 0);
    const inputSeconds = parseCountdownInputValue(instance.state.inputSeconds, 59);
    const running = instance.state.running === true;
    const totalSeconds = Number(instance.state.totalSeconds ?? inputHours * 3600 + inputMinutes * 60 + inputSeconds);
    const remainingSeconds = Number(instance.state.remainingSeconds ?? totalSeconds);
    const prevRemainingSecondsRef = useRef(remainingSeconds);

    useEffect(() => {
      if (!running) return;
      const timer = window.setInterval(() => {
        const next = Math.max(0, remainingSeconds - 1);
        onStateChange({
          ...instance.state,
          remainingSeconds: next,
          running: next > 0
        });
      }, 1000);
      return () => window.clearInterval(timer);
      // controlled by latest remaining/running
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, remainingSeconds]);

    useEffect(() => {
      if (totalSeconds > 0 && prevRemainingSecondsRef.current > 0 && remainingSeconds === 0) {
        void playCountdownAlarm().catch((error) => {
          console.warn("[countdown] play alarm failed", error);
        });
      }
      prevRemainingSecondsRef.current = remainingSeconds;
    }, [remainingSeconds, totalSeconds]);

    const progressRatio = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
    const progress = Math.min(100, Math.max(0, progressRatio * 100));
    const hh = Math.floor(remainingSeconds / 3600)
      .toString()
      .padStart(2, "0");
    const mm = Math.floor((remainingSeconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(remainingSeconds % 60)
      .toString()
      .padStart(2, "0");
    const secondHandDeg = ((((totalSeconds - remainingSeconds) % 60 + 60) % 60 / 60) * 360);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, width: "100%", minWidth: 0 }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputHoursValue}
              onChange={(event) => {
                const next = event.target.value.replace(/\D+/g, "");
                onStateChange({ ...instance.state, inputHours: next });
              }}
              placeholder="时"
              style={{
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
                textAlign: "center"
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputMinutesValue}
              onChange={(event) => {
                const next = event.target.value.replace(/\D+/g, "");
                onStateChange({ ...instance.state, inputMinutes: next });
              }}
              placeholder="分"
              style={{
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
                textAlign: "center"
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputSecondsValue}
              onChange={(event) => {
                const next = event.target.value.replace(/\D+/g, "");
                onStateChange({ ...instance.state, inputSeconds: next });
              }}
              placeholder="秒"
              style={{
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
                textAlign: "center"
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 22, justifyContent: "center", alignItems: "center" }}>
            <button
              onClick={() => {
                const total = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
                void primeMessageBoardAudio().catch((error) => {
                  console.warn("[countdown] prime audio failed", error);
                });
                onStateChange({
                  ...instance.state,
                  totalSeconds: total,
                  remainingSeconds: total,
                  running: total > 0
                });
              }}
              style={mediaIconBtnStyle({ size: 20, fontSize: 18 })}
            >
              {renderMediaControlIcon("play")}
            </button>
            <button
              onClick={() => {
                onStateChange({ ...instance.state, running: false });
              }}
              style={mediaIconBtnStyle({ size: 20, fontSize: 18 })}
            >
              {renderMediaControlIcon("pause")}
            </button>
            <button
              onClick={() => {
                const total = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
                onStateChange({
                  ...instance.state,
                  totalSeconds: total,
                  remainingSeconds: total,
                  running: false
                });
              }}
              style={mediaIconBtnStyle({ size: 20, fontSize: 18 })}
            >
              {renderMediaControlIcon("reset")}
            </button>
          </div>
        </div>
        <div
          style={{
            marginTop: 10,
            marginInline: "auto",
            width: 150,
            height: 150,
            borderRadius: "50%",
            background: `conic-gradient(rgba(37, 99, 235, 0.78) ${progress}%, rgba(226, 232, 240, 0.7) ${progress}% 100%)`,
            display: "grid",
            placeItems: "center",
            boxShadow: "0 10px 24px rgba(30,64,175,0.2)",
            position: "relative"
          }}
        >
          {Array.from({ length: 60 }).map((_, index) => (
            <span
              key={index}
              style={{
                position: "absolute",
                width: index % 15 === 0 ? 6 : index % 5 === 0 ? 4 : 3,
                height: index % 15 === 0 ? 6 : index % 5 === 0 ? 4 : 3,
                borderRadius: "50%",
                background:
                  index % 15 === 0
                    ? "rgba(30, 64, 175, 0.58)"
                    : index % 5 === 0
                      ? "rgba(37, 99, 235, 0.44)"
                      : "rgba(100, 116, 139, 0.28)",
                transform: `rotate(${index * 6}deg) translateY(-68px)`
              }}
            />
          ))}
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 2,
              height: 52,
              borderRadius: 999,
              background: "linear-gradient(180deg, rgba(220,38,38,0.9), rgba(220,38,38,0.45))",
              transform: `translate(-50%, -100%) rotate(${secondHandDeg}deg)`,
              transformOrigin: "center bottom",
              zIndex: 2,
              boxShadow: "0 0 6px rgba(220,38,38,0.45)"
            }}
          />
          <span
            style={{
              position: "absolute",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#dc2626",
              zIndex: 3
            }}
          />
          <div
            style={{
              width: 118,
              height: 118,
              borderRadius: "50%",
              background: "linear-gradient(160deg, rgba(255,255,255,0.75), rgba(255,255,255,0.42))",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              color: "#0f172a",
              padding: "18px 8px 8px"
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, transform: "translateY(15px)" }}>{`${hh}:${mm}:${ss}`}</div>
            </div>
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "weather") {
    const selectedCityCode = asString(instance.state.cityCode) || "shanghai";
    const weather = instance.state.weather as
      | {
          temperature: number;
          windSpeed: number;
          weatherCode: number;
          isDay: boolean;
          fetchedAt: string;
          forecast: WeatherForecastDay[];
        }
      | undefined;
    const loading = instance.state.weatherLoading === true;
    const error = asString(instance.state.weatherError);

    useEffect(() => {
      const city = MAJOR_CITIES.find((item) => item.value === selectedCityCode) ?? MAJOR_CITIES[1];
      let cancelled = false;

      onStateChange({ ...instance.state, weatherLoading: true, weatherError: "" });

      void fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("天气服务请求失败");
          }
          const payload = (await response.json()) as {
            current?: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number };
            daily?: {
              time?: string[];
              weather_code?: number[];
              temperature_2m_max?: number[];
              temperature_2m_min?: number[];
            };
          };
          if (!payload.current) {
            throw new Error("天气数据为空");
          }
          const forecast =
            payload.daily?.time
              ?.slice(1, 4)
              .map((date, index) => ({
                date,
                weatherCode: payload.daily?.weather_code?.[index + 1] ?? 0,
                tempMax: payload.daily?.temperature_2m_max?.[index + 1] ?? 0,
                tempMin: payload.daily?.temperature_2m_min?.[index + 1] ?? 0
              }))
              .filter((item) => item.date) ?? [];
          if (cancelled) return;
          onStateChange({
            ...instance.state,
            cityCode: city.value,
            weatherLoading: false,
            weatherError: "",
            weather: {
              temperature: payload.current.temperature_2m,
              windSpeed: payload.current.wind_speed_10m,
              weatherCode: payload.current.weather_code,
              isDay: payload.current.is_day === 1,
              fetchedAt: new Date().toISOString(),
              forecast
            }
          });
        })
        .catch((fetchError) => {
          if (cancelled) return;
          onStateChange({
            ...instance.state,
            cityCode: city.value,
            weatherLoading: false,
            weatherError: fetchError instanceof Error ? fetchError.message : "获取天气失败"
          });
        });

      return () => {
        cancelled = true;
      };
      // only refetch when city changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCityCode]);

    const currentCity = MAJOR_CITIES.find((item) => item.value === selectedCityCode) ?? MAJOR_CITIES[1];
    const weatherText = weather ? weatherCodeToText(weather.weatherCode) : "--";
    const weatherIcon = weather ? weatherCodeToIcon(weather.weatherCode, weather.isDay) : "⛅";
    const forecast = weather?.forecast ?? [];

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div className="weather-widget">
          <div className="weather-hero">
            <div className="weather-anim" title={weatherText}>
              {weatherIcon}
            </div>
            <div className="weather-current">
              <GlassSelect
                value={selectedCityCode}
                onChange={(next) => onStateChange({ ...instance.state, cityCode: next })}
                options={MAJOR_CITIES.map((city) => ({ value: city.value, label: city.label }))}
                style={{ width: "fit-content", maxWidth: "100%", margin: "0 auto" }}
                menuWidth={132}
                buttonStyle={{
                  width: "auto",
                  minHeight: 18,
                  padding: "0 20px 0 0",
                  border: "none",
                  borderRadius: 0,
                  background: "transparent",
                  boxShadow: "none",
                  fontSize: 13,
                  lineHeight: 1.1,
                  color: "#0f172a",
                  textAlign: "center"
                }}
              />
              {!loading && !error ? (
                <>
                  <div className="weather-current-temp">{weather?.temperature ?? "--"}°C</div>
                  <div className="weather-current-summary">
                    {weatherText} · 风速 {weather?.windSpeed ?? "--"} km/h
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#1f2937" }}>
            {loading ? (
              "正在获取实时天气..."
            ) : error ? (
              <span style={{ color: "#b91c1c" }}>{error}</span>
            ) : (
              <div className="weather-forecast-row">
                {forecast.map((item, index) => (
                  <div key={item.date} className="weather-forecast-card">
                    <div className="weather-forecast-day">{formatForecastDayLabel(item.date, index)}</div>
                    <div className="weather-forecast-icon">{weatherCodeToIcon(item.weatherCode, true)}</div>
                    <div className="weather-forecast-text">{weatherCodeToText(item.weatherCode)}</div>
                    <div className="weather-forecast-temp">
                      {Math.round(item.tempMax)}° / {Math.round(item.tempMin)}°
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "headline") {
    const headlines = (Array.isArray(instance.state.headlines) ? instance.state.headlines : []) as HeadlineItem[];
    const loading = instance.state.headlineLoading === true;
    const error = asString(instance.state.headlineError);
    const headlinesRef = useRef(headlines);
    const stateRef = useRef(instance.state);

    useEffect(() => {
      headlinesRef.current = headlines;
      stateRef.current = instance.state;
    }, [headlines, instance.state]);

    useEffect(() => {
      let cancelled = false;
      const load = () => {
        onStateChange({
          ...stateRef.current,
          headlineLoading: true,
          headlineError: ""
        });
        void fetchLocalizedHeadlines()
          .then((items) => {
            if (cancelled) return;
            const nextHeadlines = mergeLatestHeadline(headlinesRef.current, items);
            onStateChange({
              ...stateRef.current,
              headlineLoading: false,
              headlineError: "",
              headlines: nextHeadlines,
              headlineFetchedAt: new Date().toISOString()
            });
          })
          .catch((fetchError) => {
            if (cancelled) return;
            onStateChange({
              ...stateRef.current,
              headlineLoading: false,
              headlineError: fetchError instanceof Error ? fetchError.message : "获取新闻失败"
            });
          });
      };

      load();
      const timer = window.setInterval(load, 30_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
      // run once per widget instance
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visible = headlines.slice(0, 5);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div
          style={{
            display: "grid",
            gap: 8,
            height: "auto",
            minHeight: 0
          }}
        >
          {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
          <div
            className={isMobileMode ? undefined : "glass-scrollbar"}
            style={{
              display: "grid",
              gap: 6,
              minHeight: isMobileMode ? 74 : undefined,
              overflow: "visible",
              paddingRight: 0
            }}
          >
            {visible.map((item) => {
              const displayTitle = item.translatedTitle?.trim() || item.title;
              return (
              <a
                key={item.id}
                href={item.url || "#"}
                target={item.url ? "_blank" : undefined}
                rel={item.url ? "noreferrer" : undefined}
                onClick={(event) => {
                  if (!item.url) {
                    event.preventDefault();
                  }
                }}
                style={{
                  textDecoration: "none",
                  display: "grid",
                  gap: 2,
                  padding: "2px 0"
                }}
              >
                <div className="headline-marquee">
                  <span className="headline-marquee-track">
                    <span>{displayTitle}</span>
                    <span aria-hidden="true">{displayTitle}</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {item.source
                    ? `${item.source}${item.time ? ` · ${formatPublishedTime(item.time)}` : ""}`
                    : item.time
                      ? `${formatPublishedTime(item.time)}`
                      : ""}
                </div>
              </a>
              );
            })}
            {!loading && !error && visible.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>暂无新闻</div>
            ) : null}
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "market") {
    const allowedCodes = new Set<string>(GLOBAL_INDICES.map((item) => item.value));
    const oldSingleCode = asString(instance.state.indexCode);
    const selectedIndexCodesRaw = asArray(instance.state.indexCodes);
    const selectedIndexCodes = (selectedIndexCodesRaw.length ? selectedIndexCodesRaw : [oldSingleCode || "usINX"]).filter(
      (code, idx, arr) => allowedCodes.has(code) && arr.indexOf(code) === idx
    );
    const [addCode, setAddCode] = useState(selectedIndexCodes[0] ?? "usINX");
    const marketMapRaw = instance.state.marketMap as
      | Record<
          string,
          MarketSeries & {
            fetchedAt: string;
            label: string;
          }
        >
      | undefined;
    const marketMap = marketMapRaw ?? {};
    const loading = instance.state.marketLoading === true;

    useEffect(() => {
      if (!selectedIndexCodes.length) {
        return;
      }
      let cancelled = false;

      const load = () => {
        onStateChange({
          ...instance.state,
          indexCodes: selectedIndexCodes,
          marketLoading: true,
          marketError: ""
        });
        void Promise.allSettled(
          selectedIndexCodes.map(async (code) => {
            const index = GLOBAL_INDICES.find((item) => item.value === code) ?? GLOBAL_INDICES[0];
            const series = await fetchMarketSeries(index.marketCode);
            return { code, label: index.label, series };
          })
        )
          .then((results) => {
            if (cancelled) return;
            const nextMap: Record<string, MarketSeries & { fetchedAt: string; label: string }> = {};
            results.forEach((item, idx) => {
              if (item.status === "fulfilled") {
                nextMap[item.value.code] = {
                  ...item.value.series,
                  fetchedAt: new Date().toISOString(),
                  label: item.value.label
                };
              }
            });
            onStateChange({
              ...instance.state,
              indexCodes: selectedIndexCodes,
              marketLoading: false,
              marketError: "",
              marketMap: nextMap
            });
          })
          .catch((fetchError) => {
            if (cancelled) return;
            onStateChange({
              ...instance.state,
              indexCodes: selectedIndexCodes,
              marketLoading: false,
              marketError: ""
            });
          });
      };

      load();
      const timer = window.setInterval(load, 60_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
      // refetch when selected codes change
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIndexCodes.join(",")]);

    const toMinute = (hhmm: string): number | null => {
      if (!/^\d{4}$/.test(hhmm)) return null;
      const h = Number(hhmm.slice(0, 2));
      const m = Number(hhmm.slice(2, 4));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };

    const width = 260;
    const height = 20;
    const selectedRows = selectedIndexCodes
      .map((code) => ({ code, data: marketMap[code] }))
      .filter((row) => Boolean(row.data));

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
            <GlassSelect
              value={addCode}
              onChange={setAddCode}
              options={GLOBAL_INDICES.map((item) => ({ value: item.value, label: item.label }))}
            />
            <button
              onClick={() => {
                if (selectedIndexCodes.includes(addCode)) return;
                onStateChange({
                  ...instance.state,
                  indexCodes: [...selectedIndexCodes, addCode]
                });
              }}
              style={{
                border: "1px solid rgba(96,165,250,0.6)",
                borderRadius: 12,
                padding: "0 10px",
                height: 32,
                background: "linear-gradient(155deg, rgba(37,99,235,0.78), rgba(56,189,248,0.7))",
                color: "#eff6ff",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer"
              }}
              title="增加指数"
            >
              +
            </button>
          </div>

          {loading ? <div style={{ fontSize: 12, color: "#64748b" }}>正在更新指数...</div> : null}

          {selectedRows.map((row) => {
            const data = row.data!;
            const values = (data.intraday?.length ? data.intraday.map((p) => p.v) : data.points).filter((v) =>
              Number.isFinite(v)
            );
            const min = values.length ? Math.min(...values) : 0;
            const max = values.length ? Math.max(...values) : 0;
            const range = max - min || 1;
            const sessionStartMin = toMinute(data.sessionStart || "0930") ?? 570;
            const sessionEndMin = toMinute(data.sessionEnd || "1600") ?? 960;
            const sessionRange = Math.max(1, sessionEndMin - sessionStartMin);
            const intraday = Array.isArray(data.intraday) ? data.intraday : [];
            const path =
              intraday.length > 1
                ? intraday
                    .map((point) => {
                      const x = ((point.t - sessionStartMin) / sessionRange) * width;
                      const y = height - ((point.v - min) / range) * height;
                      return `${x.toFixed(2)},${y.toFixed(2)}`;
                    })
                    .join(" ")
                : data.points.length > 1
                  ? data.points
                      .map((value, idx, arr) => {
                        const x = (idx / (arr.length - 1)) * width;
                        const y = height - ((value - min) / range) * height;
                        return `${x.toFixed(2)},${y.toFixed(2)}`;
                      })
                      .join(" ")
                  : "";
            const diff = data.last - data.prev;
            const diffPct = data.prev ? (diff / data.prev) * 100 : 0;
            const up = diff >= 0;
            return (
              <div key={row.code} style={{ display: "grid", gap: 4, paddingBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "#334155" }}>{data.label}</div>
                  <button
                    onClick={() =>
                      onStateChange({
                        ...instance.state,
                        indexCodes: selectedIndexCodes.filter((code) => code !== row.code)
                      })
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1
                    }}
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 16, lineHeight: 1, color: "#0f172a", fontWeight: 600 }}>
                    {data.last.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: up ? "#15803d" : "#b91c1c" }}>
                    {up ? "+" : ""}
                    {diff.toFixed(2)} ({up ? "+" : ""}
                    {diffPct.toFixed(2)}%)
                  </div>
                </div>
                <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={20} role="img" aria-label={`${data.label}走势`}>
                  {path ? (
                    <polyline
                      points={path}
                      fill="none"
                      stroke={up ? "rgba(22, 163, 74, 0.95)" : "rgba(220, 38, 38, 0.95)"}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                </svg>
              </div>
            );
          })}
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "music") {
    const query = asString(instance.state.query);
    const [results, setResults] = useState<ITunesTrack[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [activeTrackId, setActiveTrackId] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const searchSeqRef = useRef(0);
    const composingRef = useRef(false);
    const [queryDraft, setQueryDraft] = useState(query);
    const resultsRef = useRef<ITunesTrack[]>([]);
    const activeTrackIdRef = useRef<number | null>(null);

    const inputStyle: CSSProperties = {
      width: "100%",
      borderRadius: 12,
      border: "1px solid rgba(203, 213, 225, 0.65)",
      padding: "6px 8px",
      background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
      fontSize: 12
    };

    useEffect(() => {
      if (!composingRef.current) {
        setQueryDraft(query);
      }
    }, [query]);

    useEffect(() => {
      resultsRef.current = results;
    }, [results]);

    useEffect(() => {
      activeTrackIdRef.current = activeTrackId;
    }, [activeTrackId]);

    useEffect(() => {
      const audio = new Audio();
      audio.preload = "none";
      const onTimeUpdate = () => {
        if (!audio.duration || Number.isNaN(audio.duration)) {
          setProgress(0);
          return;
        }
        setProgress((audio.currentTime / audio.duration) * 100);
      };
      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onEnded = () => {
        const currentId = activeTrackIdRef.current;
        const currentResults = resultsRef.current;
        if (!currentId || !currentResults.length) {
          setIsPlaying(false);
          setProgress(0);
          return;
        }
        const currentIndex = currentResults.findIndex((item) => item.trackId === currentId);
        const nextTrack = currentIndex >= 0 ? currentResults.slice(currentIndex + 1).find((item) => Boolean(item.previewUrl)) : null;
        if (!nextTrack?.previewUrl) {
          setIsPlaying(false);
          setProgress(0);
          return;
        }
        audio.src = nextTrack.previewUrl;
        setActiveTrackId(nextTrack.trackId);
        setProgress(0);
        void audio.play().catch(() => {
          setError("自动播放下一首失败，请手动点击播放");
          setIsPlaying(false);
        });
      };
      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("play", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);
      audioRef.current = audio;
      return () => {
        audio.pause();
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
      };
    }, []);

    const runSearch = (rawKeyword?: string) => {
      const keyword = (rawKeyword ?? query).trim();
      if (!keyword) {
        setResults([]);
        setError("");
        setLoading(false);
        return;
      }
      const seq = ++searchSeqRef.current;
      setLoading(true);
      setError("");
      void searchITunesTracks(keyword)
        .then((items) => {
          if (seq !== searchSeqRef.current) return;
          setResults(items);
          if (!items.length) setError("未找到可试听结果");
        })
        .catch((searchError) => {
          if (seq !== searchSeqRef.current) return;
          setError(searchError instanceof Error ? searchError.message : "搜索失败");
          setResults([]);
        })
        .finally(() => {
          if (seq !== searchSeqRef.current) return;
          setLoading(false);
        });
    };

    useEffect(() => {
      const keyword = query.trim();
      if (!keyword) {
        searchSeqRef.current += 1;
        setResults([]);
        setError("");
        setLoading(false);
        return;
      }
      const timer = window.setTimeout(() => {
        runSearch(keyword);
      }, 300);
      return () => window.clearTimeout(timer);
      // search depends on query only
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
          <input
            value={queryDraft}
            onChange={(event) => {
              const next = event.target.value;
              setQueryDraft(next);
              if (!composingRef.current) {
                onStateChange({ ...instance.state, query: next });
              }
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              const next = event.currentTarget.value;
              setQueryDraft(next);
              onStateChange({ ...instance.state, query: next });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onStateChange({ ...instance.state, query: queryDraft });
                runSearch(queryDraft);
              }
            }}
            placeholder="搜索歌曲 / 歌手"
            style={inputStyle}
          />
          <Button onClick={runSearch}>
            <span style={{ fontSize: 24, lineHeight: 1, display: "inline-block" }}>⌕</span>
          </Button>
        </div>
        {loading ? <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>搜索中...</div> : null}
        {error ? <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>{error}</div> : null}
        <div className="glass-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto", paddingRight: 2 }}>
          {results.map((track) => {
            const active = activeTrackId === track.trackId;
            return (
              <div
                key={track.trackId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px auto 1fr",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                {track.artworkUrl100 ? (
                  <img
                    src={track.artworkUrl100}
                    alt={track.trackName}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      objectFit: "cover",
                      background: "rgba(226, 232, 240, 0.5)"
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: "rgba(226, 232, 240, 0.5)"
                    }}
                  />
                )}
                <button
                  onClick={() => {
                    if (!track.previewUrl || !audioRef.current) return;
                    if (active && isPlaying) {
                      audioRef.current.pause();
                      return;
                    }
                    if (!active) {
                      audioRef.current.src = track.previewUrl;
                      setActiveTrackId(track.trackId);
                      setProgress(0);
                    }
                    void audioRef.current.play().catch(() => {
                      setError("播放失败，请重试");
                    });
                  }}
                  style={mediaIconBtnStyle({ size: 16, fontSize: 14 })}
                  title={active && isPlaying ? "暂停" : "播放"}
                >
                  {renderMediaControlIcon(active && isPlaying ? "pause" : "play")}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 13,
                      color: "#0f172a"
                    }}
                  >
                    {track.trackName}
                  </div>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 11,
                      color: "#334155"
                    }}
                  >
                    {track.artistName}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      height: 2,
                      width: "100%",
                      borderRadius: 2,
                      background: "rgba(100, 116, 139, 0.3)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: active ? `${progress}%` : 0,
                        background: "rgba(31, 41, 55, 0.75)",
                        transition: "width 120ms linear"
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && !results.length && !error ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>输入关键词后搜索并试听 30 秒。</div>
          ) : null}
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "tv") {
    const playlistUrl = asString(instance.state.playlistUrl).trim() || DEFAULT_TV_PLAYLIST_URL;
    const selectedChannelUrl = asString(instance.state.selectedChannelUrl);
    const [playlistDraft, setPlaylistDraft] = useState(playlistUrl);
    const [channels, setChannels] = useState<TvChannel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [playbackError, setPlaybackError] = useState("");
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<import("hls.js").default | null>(null);
    const latestStateRef = useRef(instance.state);

    useEffect(() => {
      latestStateRef.current = instance.state;
    }, [instance.state]);

    useEffect(() => {
      setPlaylistDraft(playlistUrl);
    }, [playlistUrl]);

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const loadPlaylist = (sourceUrl?: string) => {
      const source = (sourceUrl ?? playlistDraft).trim() || DEFAULT_TV_PLAYLIST_URL;
      setLoading(true);
      setError("");
      void fetch(source)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`订阅加载失败 (${response.status})`);
          }
          return response.text();
        })
        .then((content) => {
          const parsed = parseM3UPlaylist(content);
          setChannels(parsed);
          if (parsed.length === 0) {
            onStateChange({
              ...latestStateRef.current,
              playlistUrl: source,
              selectedChannelUrl: "",
              selectedChannelName: ""
            });
            setError("未解析到频道");
            return;
          }

          const preferredUrl = asString(latestStateRef.current.selectedChannelUrl);
          const preferredName = asString(latestStateRef.current.selectedChannelName);
          const selected =
            parsed.find((item) => item.url === preferredUrl) ??
            parsed.find((item) => item.name === preferredName) ??
            parsed[0];
          onStateChange({
            ...latestStateRef.current,
            playlistUrl: source,
            selectedChannelUrl: selected.url,
            selectedChannelName: selected.name
          });
        })
        .catch((fetchError) => {
          setError(fetchError instanceof Error ? fetchError.message : "加载订阅失败");
        })
        .finally(() => {
          setLoading(false);
        });
    };

    useEffect(() => {
      const source = playlistUrl || DEFAULT_TV_PLAYLIST_URL;
      if (!asString(instance.state.playlistUrl).trim()) {
        onStateChange({
          ...instance.state,
          playlistUrl: source
        });
      }
      loadPlaylist(source);
      // initialize once for this widget instance
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      return () => destroyHls();
      // cleanup only on unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      destroyHls();
      setPlaybackError("");
      video.pause();
      video.removeAttribute("src");
      video.load();

      if (!selectedChannelUrl) {
        return;
      }

      const source = selectedChannelUrl;
      const nativePlay = () => {
        video.src = source;
        video.load();
        void video.play().catch(() => {
          // Autoplay may be blocked; keep controls available for manual play.
        });
      };

      const isM3u8 = /\.m3u8($|\?)/i.test(source);
      if (!isM3u8) {
        nativePlay();
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        nativePlay();
        return;
      }

      void import("hls.js")
        .then((mod) => {
          const Hls = mod.default;
          const media = videoRef.current;
          if (!media) return;
          if (!Hls.isSupported()) {
            setPlaybackError("当前浏览器不支持该直播流格式");
            return;
          }
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(source);
          hls.attachMedia(media);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) {
              setPlaybackError("直播流播放失败，请切换频道重试");
            }
          });
          void media.play().catch(() => {
            // Autoplay may be blocked; keep controls available for manual play.
          });
        })
        .catch(() => {
          setPlaybackError("播放器加载失败");
        });
    }, [selectedChannelUrl]);

    const contentHeight = Math.max(240, Number(instance.size.h) - 74);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ height: contentHeight, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="tv-video-box">
            <video
              ref={videoRef}
              data-no-drag="true"
              controls
              playsInline
              preload="none"
              onError={() => setPlaybackError("视频播放失败，请切换频道重试")}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 10,
                background: "#020617"
              }}
            />
            {!selectedChannelUrl ? <div className="tv-video-overlay">请选择频道开始播放</div> : null}
            {playbackError ? <div className="tv-video-overlay tv-video-overlay-error">{playbackError}</div> : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              value={playlistDraft}
              onChange={(event) => setPlaylistDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                const source = playlistDraft.trim() || DEFAULT_TV_PLAYLIST_URL;
                onStateChange({
                  ...latestStateRef.current,
                  playlistUrl: source
                });
                loadPlaylist(source);
              }}
              placeholder="输入 m3u 订阅地址"
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
            <Button
              onClick={() => {
                const source = playlistDraft.trim() || DEFAULT_TV_PLAYLIST_URL;
                onStateChange({
                  ...latestStateRef.current,
                  playlistUrl: source
                });
                loadPlaylist(source);
              }}
            >
              ↻
            </Button>
          </div>

          {loading ? <div style={{ fontSize: 12, color: "#64748b" }}>正在解析频道...</div> : null}
          {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}

          <div className="tv-channel-list">
            {channels.map((channel, index) => {
              const active = channel.url === selectedChannelUrl;
              return (
                <button
                  key={channel.id}
                  type="button"
                  className={`tv-channel-item${active ? " is-active" : ""}`}
                  onClick={() => {
                    setPlaybackError("");
                    onStateChange({
                      ...latestStateRef.current,
                      selectedChannelUrl: channel.url,
                      selectedChannelName: channel.name
                    });
                  }}
                >
                  <span>{channel.name}</span>
                  <small>#{index + 1}</small>
                </button>
              );
            })}
            {!loading && !error && channels.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>暂无可播放频道</div>
            ) : null}
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "dialClock") {
    const [clockState, setClockState] = useState(() => toDialClockTimeState(new Date()));
    const [sweepFrameIndex, setSweepFrameIndex] = useState(-1);
    const [sweepDurationMs, setSweepDurationMs] = useState(DIAL_CLOCK_HOURLY_AUDIO_FALLBACK_DURATION_MS);
    const hourlyAudioRef = useRef<HTMLAudioElement | null>(null);
    const lastSweepKeyRef = useRef("");
    const sweepTimerRef = useRef<number | null>(null);
    const tickTimerRef = useRef<number | null>(null);
    const hourlyAudioTimerRef = useRef<number | null>(null);
    const sweepFrames = useMemo(() => getDialClockSweepFrames(sweepDurationMs), [sweepDurationMs]);

    useEffect(() => {
      if (typeof Audio === "undefined") {
        return;
      }

      const audio = new Audio(DIAL_CLOCK_HOURLY_AUDIO_SRC);
      audio.preload = "auto";
      hourlyAudioRef.current = audio;

      const syncDuration = () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
          return;
        }
        setSweepDurationMs(Math.round(audio.duration * 1000));
      };

      audio.addEventListener("loadedmetadata", syncDuration);
      audio.addEventListener("durationchange", syncDuration);

      return () => {
        audio.pause();
        audio.removeEventListener("loadedmetadata", syncDuration);
        audio.removeEventListener("durationchange", syncDuration);
        hourlyAudioRef.current = null;
      };
    }, []);

    useEffect(() => {
      const clearSweepTimer = () => {
        if (sweepTimerRef.current !== null) {
          window.clearTimeout(sweepTimerRef.current);
          sweepTimerRef.current = null;
        }
      };

      const clearHourlyAudioTimer = () => {
        if (hourlyAudioTimerRef.current !== null) {
          window.clearTimeout(hourlyAudioTimerRef.current);
          hourlyAudioTimerRef.current = null;
        }
      };

      const runSweep = () => {
        clearSweepTimer();
        clearHourlyAudioTimer();
        hourlyAudioTimerRef.current = window.setTimeout(() => {
          hourlyAudioTimerRef.current = null;
          void playDialClockHourlyAudio(hourlyAudioRef.current);
        }, DIAL_CLOCK_HOURLY_AUDIO_DELAY_MS);

        const playFrame = (index: number) => {
          const frame = sweepFrames[index];
          if (!frame) {
            setSweepFrameIndex(-1);
            sweepTimerRef.current = null;
            return;
          }

          setSweepFrameIndex(index);
          if (index >= sweepFrames.length - 1) {
            sweepTimerRef.current = window.setTimeout(() => {
              setSweepFrameIndex(-1);
              sweepTimerRef.current = null;
            }, frame.frameDurationMs);
            return;
          }

          const nextDelay =
            frame.frameDurationMs + (frame.isPhraseEnd ? DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS : 0);
          sweepTimerRef.current = window.setTimeout(() => playFrame(index + 1), nextDelay);
        };

        playFrame(0);
      };

      const syncClock = () => {
        const now = new Date();
        setClockState(toDialClockTimeState(now));

        if (shouldTriggerDialClockSweep(now)) {
          const sweepKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
          if (lastSweepKeyRef.current !== sweepKey) {
            lastSweepKeyRef.current = sweepKey;
            runSweep();
          }
        }

        tickTimerRef.current = window.setTimeout(syncClock, Math.max(32, 1000 - now.getMilliseconds()));
      };

      syncClock();
      return () => {
        clearSweepTimer();
        clearHourlyAudioTimer();
        if (tickTimerRef.current !== null) {
          window.clearTimeout(tickTimerRef.current);
          tickTimerRef.current = null;
        }
      };
    }, [sweepFrames]);

    const marks = buildDialClockMarkStates(
      clockState,
      sweepFrameIndex >= 0 ? sweepFrames[sweepFrameIndex] : null
    );

    return (
      <Card
        tone="slate"
        style={{
          padding: isMobileMode ? 12 : 14,
          borderRadius: 22
        }}
      >
        <div className="dial-clock-widget">
          <div className="dial-clock-square">
            <div className="dial-clock-face">
              {marks.map((mark) => {
                const angle = mark.index * 6;
                const radians = ((angle - 90) * Math.PI) / 180;
                const radius = mark.isMajor ? 43.98 : 44.7;
                const left = 50 + Math.cos(radians) * radius;
                const top = 50 + Math.sin(radians) * radius;
                const className = [
                  "dial-clock-mark",
                  mark.isMajor ? "is-major" : "",
                  mark.minuteActive ? "is-minute-active" : "",
                  mark.secondTrailLevel !== null ? `is-second-tail-${mark.secondTrailLevel}` : "",
                  mark.sweepTrailLevel !== null ? "is-sweep-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                const sweepStyle =
                  mark.sweepTrailLevel === null
                    ? {}
                    : (() => {
                        const sweepOpacity = Math.max(0.16, 1 - mark.sweepTrailLevel * 0.085);
                        return {
                          background: `rgba(255, 255, 255, ${sweepOpacity})`,
                          boxShadow: `0 0 ${12 - Math.min(mark.sweepTrailLevel, 9) * 0.8}px rgba(255, 255, 255, ${
                            Math.max(0.18, sweepOpacity * 0.96)
                          }), 0 0 ${24 - Math.min(mark.sweepTrailLevel, 9) * 1.2}px rgba(226, 232, 240, ${
                            Math.max(0.12, sweepOpacity * 0.62)
                          })`
                        } satisfies CSSProperties;
                      })();

                return (
                  <span
                    key={mark.index}
                    className={className}
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                      ...sweepStyle
                    }}
                  />
                );
              })}

              {DIAL_CLOCK_NUMBERS.map((number, index) => {
                const angle = index * 30;
                const radians = ((angle - 90) * Math.PI) / 180;
                const radius = number === 12 || number === 6 ? 32.5 : 34.2;
                const left = 50 + Math.cos(radians) * radius;
                const top = 50 + Math.sin(radians) * radius;
                return (
                  <span
                    key={number}
                    className={`dial-clock-number${clockState.hourNumber === number ? " is-active" : ""}`}
                    style={{
                      left: `${left}%`,
                      top: `${top}%`
                    }}
                  >
                    {number}
                  </span>
                );
              })}

              <div className={`dial-clock-icon dial-clock-icon-moon${clockState.isAm ? "" : " is-active"}`}>
                <DialClockMoonIcon active={!clockState.isAm} />
              </div>
              <div className="dial-clock-brand">BALMUDA</div>
              <div className={`dial-clock-icon dial-clock-icon-sun${clockState.isAm ? " is-active" : ""}`}>
                <DialClockSunIcon active={clockState.isAm} />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (definition.type === "worldClock") {
    const zones = normalizeWorldClockZones(instance.state.zones);
    const slots = toWorldClockSlots(zones);
    const [now, setNow] = useState(() => new Date());
    const [toneClasses] = useState(() => getRandomWorldClockToneClasses());

    useEffect(() => {
      let timer: number | null = null;
      const schedule = () => {
        const current = new Date();
        setNow(current);
        const delay = Math.max(1000, 60000 - (current.getSeconds() * 1000 + current.getMilliseconds()));
        timer = window.setTimeout(schedule, delay);
      };
      schedule();
      return () => {
        if (timer !== null) {
          window.clearTimeout(timer);
        }
      };
    }, []);

    useEffect(() => {
      const rawZones = asArray(instance.state.zones);
      if (stringArraysEqual(rawZones, zones)) {
        return;
      }
      onStateChange({
        ...instance.state,
        zones
      });
    }, [instance.state, onStateChange, zones]);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div className="world-clock-widget">
          <div className={`world-clock-grid ${getWorldClockLayoutClass(slots.length)}`}>
            {slots.map((timeZone, index) => {
              const display = formatWorldClockDisplay(now, timeZone);
              const toneClass = toneClasses[index % toneClasses.length];
              const metaText = display.zoneName === display.offset ? display.offset : `${display.zoneName} ${display.offset}`;
              const optionItems = WORLD_CLOCK_ZONE_OPTIONS.filter(
                (item) => item.value !== CHINA_TIME_ZONE && (item.value === timeZone || !slots.includes(item.value))
              ).map((item) => ({
                value: item.value,
                label: item.shortLabel
              }));
              return (
                <div key={timeZone} className={`world-clock-cell ${toneClass}`}>
                  <div className="world-clock-city-row">
                    {index === 0 ? (
                      <div
                        className="world-clock-city world-clock-city-fixed"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 18,
                          lineHeight: 1.1,
                          paddingTop: 8,
                          paddingRight: isMobileMode ? 20 : 20
                        }}
                      >
                        {getWorldClockOptionLabel(timeZone)}
                      </div>
                    ) : (
                      <GlassSelect
                        value={timeZone}
                        options={optionItems}
                        onChange={(next) =>
                          onStateChange({
                            ...instance.state,
                            zones: updateWorldClockSlot(zones, index, next)
                          })
                        }
                        style={{ width: "fit-content", maxWidth: "100%" }}
                        menuWidth={124}
                        buttonStyle={{
                          width: "auto",
                          minHeight: 18,
                          padding: isMobileMode ? "0 20px 0 0" : "0 20px 0 0",
                          border: "none",
                          borderRadius: 0,
                          background: "transparent",
                          boxShadow: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          lineHeight: 1.1,
                          color: "rgba(15, 23, 42, 0.8)"
                        }}
                      />
                    )}
                  </div>
                  <div className="world-clock-time">{display.time}</div>
                  <div className="world-clock-meta">{metaText}</div>
                </div>
              );
            })}
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "clipboard") {
    const records = normalizeClipboardRecords(instance.state.items);
    const pinnedCount = records.filter((item) => item.pinned).length;
    const error = asString(instance.state.clipboardError);
    const [reading, setReading] = useState(false);
    const recordsRef = useRef(records);
    const stateRef = useRef(instance.state);

    useEffect(() => {
      recordsRef.current = records;
      stateRef.current = instance.state;
    }, [records, instance.state]);

    const saveClipboardItem = (value: string) => {
      const text = value.trim();
      if (!text) {
        onStateChange({ ...stateRef.current, clipboardError: "内容为空" });
        return;
      }
      const currentRecords = recordsRef.current;
      const existing = currentRecords.find((item) => item.text === text);
      const nextHead: ClipboardRecord = existing
        ? { ...existing, text, createdAt: new Date().toISOString() }
        : {
            id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text,
            pinned: false,
            createdAt: new Date().toISOString()
          };
      const merged = [nextHead, ...currentRecords.filter((item) => item.id !== nextHead.id)];
      const nextRecords = trimUnpinnedRecords(merged, 30);
      onStateChange({
        ...stateRef.current,
        items: nextRecords,
        clipboardError: ""
      });
    };

    useEffect(() => {
      const onCopyLike = (event: ClipboardEvent) => {
        const fromEvent = event.clipboardData?.getData("text/plain")?.trim();
        if (fromEvent) {
          saveClipboardItem(fromEvent);
          return;
        }
        const selection = window.getSelection?.()?.toString().trim();
        if (selection) {
          saveClipboardItem(selection);
        }
      };

      const onPaste = (event: ClipboardEvent) => {
        const pasted = event.clipboardData?.getData("text/plain")?.trim();
        if (pasted) {
          saveClipboardItem(pasted);
        }
      };

      document.addEventListener("copy", onCopyLike);
      document.addEventListener("cut", onCopyLike);
      document.addEventListener("paste", onPaste);
      return () => {
        document.removeEventListener("copy", onCopyLike);
        document.removeEventListener("cut", onCopyLike);
        document.removeEventListener("paste", onPaste);
      };
      // listener registers once for this widget instance
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const captureClipboard = () => {
      if (!navigator.clipboard?.readText) {
        const pasted = window.prompt("当前环境不支持直接读取剪贴板，请粘贴文本：", "");
        if (pasted !== null) saveClipboardItem(pasted);
        return;
      }
      setReading(true);
      void navigator.clipboard
        .readText()
        .then((text) => {
          saveClipboardItem(text);
        })
        .catch((readError) => {
          const pasted = window.prompt("读取剪贴板失败，请手动粘贴：", "");
          if (pasted !== null) {
            saveClipboardItem(pasted);
          } else {
            onStateChange({
              ...instance.state,
              clipboardError: readError instanceof Error ? readError.message : "读取剪贴板失败"
            });
          }
        })
        .finally(() => {
          setReading(false);
        });
    };

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={captureClipboard}
            style={{
              border: "1px solid rgba(248, 113, 113, 0.45)",
              background: "linear-gradient(165deg, rgba(254, 202, 202, 0.45), rgba(248, 113, 113, 0.22))",
              width: 24,
              height: 24,
              borderRadius: "50%",
              padding: 0,
              color: "#dc2626",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
              transform: "rotate(60deg)",
              transformOrigin: "center",
              display: "grid",
              placeItems: "center"
            }}
            title="记录"
          >
            {reading ? "…" : "✏︎"}
          </button>
        </div>
        {error ? <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>{error}</div> : null}
        <div className="glass-scrollbar" style={{ maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 2 }}>
          {records.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>点击红色铅笔记录复制内容</div>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 8,
                  alignItems: "center",
                  borderRadius: 10,
                  border: "1px solid rgba(203, 213, 225, 0.55)",
                  padding: "6px 8px",
                  background: "linear-gradient(160deg, rgba(255,255,255,0.56), rgba(255,255,255,0.3))",
                  color: "#0f172a",
                  fontSize: 12,
                  lineHeight: 1.4
                }}
              >
                <button
                  onClick={() => {
                    if (!record.pinned && pinnedCount >= 30) {
                      onStateChange({
                        ...instance.state,
                        clipboardError: "固定记录已超过30条，请先删除记录"
                      });
                      return;
                    }
                    const nextRecords = records.map((item) =>
                      item.id === record.id ? { ...item, pinned: !item.pinned } : item
                    );
                    onStateChange({
                      ...instance.state,
                      items: nextRecords,
                      clipboardError: ""
                    });
                  }}
                  style={{
                    border: "none",
                    background: record.pinned ? "rgba(51, 65, 85, 0.12)" : "transparent",
                    borderRadius: 6,
                    padding: record.pinned ? "1.1px 2.2px" : "1px 2px",
                    cursor: "pointer",
                    color: record.pinned ? "#334155" : "#94a3b8",
                    fontSize: 14,
                    lineHeight: 1,
                    transform: "translateY(1px)"
                  }}
                  title={record.pinned ? "取消固定" : "固定"}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M4 1.25h4l-.75 2.7 1.75 1v.95H3v-.95l1.75-1L4 1.25ZM6 5.9V10.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => void navigator.clipboard?.writeText(record.text)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    minWidth: 0,
                    cursor: "pointer",
                    color: "#0f172a"
                  }}
                  title="点击复制"
                >
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{record.text}</div>
                </button>
                <button
                  onClick={() => void navigator.clipboard?.writeText(record.text)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontSize: 13,
                    lineHeight: 1
                  }}
                  title="复制"
                >
                  ⧉
                </button>
                <button
                  onClick={() => {
                    const nextRecords = records.filter((item) => item.id !== record.id);
                    onStateChange({
                      ...instance.state,
                      items: nextRecords,
                      clipboardError: ""
                    });
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontSize: 13,
                    lineHeight: 1
                  }}
                  title="删除"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "converter") {
    const category = asString(instance.state.category) || "length";
    const units = CONVERTER_UNIT_OPTIONS[category] ?? CONVERTER_UNIT_OPTIONS.length;
    const fromUnit = asString(instance.state.fromUnit) || units[0]?.value || "m";
    const toUnit = asString(instance.state.toUnit) || units[1]?.value || units[0]?.value || "km";
    const rawValue = asString(instance.state.inputValue);
    const numericValue = Number(rawValue);
    const hasNumber = rawValue.trim() !== "" && Number.isFinite(numericValue);
    const result = hasNumber ? convertUnit(numericValue, category, fromUnit, toUnit) : null;

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <GlassSelect
            value={category}
            onChange={(nextCategory) => {
              const nextUnits = CONVERTER_UNIT_OPTIONS[nextCategory] ?? CONVERTER_UNIT_OPTIONS.length;
              onStateChange({
                ...instance.state,
                category: nextCategory,
                fromUnit: nextUnits[0]?.value ?? "",
                toUnit: nextUnits[1]?.value ?? nextUnits[0]?.value ?? ""
              });
            }}
            options={CONVERTER_CATEGORY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />

          <input
            value={rawValue}
            onChange={(event) => onStateChange({ ...instance.state, inputValue: event.target.value })}
            inputMode="decimal"
            placeholder="输入数值"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(203, 213, 225, 0.65)",
              padding: "6px 8px",
              background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
            <GlassSelect
              value={fromUnit}
              onChange={(next) => onStateChange({ ...instance.state, fromUnit: next })}
              options={units.map((item) => ({ value: item.value, label: item.label }))}
            />
            <button
              onClick={() => onStateChange({ ...instance.state, fromUnit: toUnit, toUnit: fromUnit })}
              style={{
                border: "none",
                background: "transparent",
                color: "#334155",
                fontSize: 14,
                cursor: "pointer",
                padding: "0 2px"
              }}
              title="交换"
            >
              ⇄
            </button>
            <GlassSelect
              value={toUnit}
              onChange={(next) => onStateChange({ ...instance.state, toUnit: next })}
              options={units.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>

          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(203, 213, 225, 0.65)",
              padding: "8px 10px",
              minHeight: 40,
              color: "#0f172a",
              fontSize: 13,
              background: "linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))"
            }}
          >
            {hasNumber ? `${result?.toFixed(6).replace(/\.?0+$/, "")} ${toUnit}` : "结果会显示在这里"}
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "translate") {
    interface TranslateHistoryItem {
      sourceText: string;
      translatedText: string;
      sourceLang: string;
      targetLang: string;
      translatedAt: string;
    }

    const sourceText = asString(instance.state.sourceText);
    const translatedText = asString(instance.state.translatedText);
    const sourceLang = asString(instance.state.sourceLang) || "auto";
    const targetLang = asString(instance.state.targetLang) || "zh-CN";
    const translating = instance.state.translating === true;
    const translateError = asString(instance.state.translateError);
    const history = (Array.isArray(instance.state.translateHistory) ? instance.state.translateHistory : []) as TranslateHistoryItem[];
    const rawHistoryIndex = Number(instance.state.translateHistoryIndex ?? (history.length ? history.length - 1 : -1));
    const historyIndex = Number.isFinite(rawHistoryIndex) ? rawHistoryIndex : -1;
    const canPrev = historyIndex > 0;
    const canNext = historyIndex >= 0 && historyIndex < history.length - 1;
    const sourceHeight = Number(instance.state.sourceHeight ?? 108);
    const resultHeight = Number(instance.state.resultHeight ?? 96);
    const pasteSourceText = async () => {
      if (!navigator.clipboard?.readText) {
        onStateChange({
          ...instance.state,
          translateError: "当前浏览器不支持读取剪贴板"
        });
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        onStateChange({
          ...instance.state,
          sourceText: text,
          translateError: ""
        });
      } catch (error) {
        onStateChange({
          ...instance.state,
          translateError: error instanceof Error ? error.message : "读取剪贴板失败"
        });
      }
    };

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <GlassSelect
            value={sourceLang}
            onChange={(next) => onStateChange({ ...instance.state, sourceLang: next })}
            options={TRANSLATE_LANG_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
          <button
            onClick={() => {
              const nextSourceLang = targetLang;
              const nextTargetLang = sourceLang === "auto" ? "zh-CN" : sourceLang;
              onStateChange({
                ...instance.state,
                sourceLang: nextSourceLang,
                targetLang: nextTargetLang,
                sourceText: translatedText,
                translatedText: sourceText
              });
            }}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.42)",
              borderRadius: 10,
              background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
              minHeight: 32,
              minWidth: 34,
              cursor: "pointer",
              color: "#334155",
              fontSize: 14
            }}
            title="交换"
          >
            ⇄
          </button>
          <GlassSelect
            value={targetLang}
            onChange={(next) => onStateChange({ ...instance.state, targetLang: next })}
            options={TRANSLATE_LANG_OPTIONS.filter((option) => option.value !== "auto").map((option) => ({
              value: option.value,
              label: option.label
            }))}
          />
        </div>

        <VerticalResizableTextarea
          value={sourceText}
          onCommit={(next) => onStateChange({ ...instance.state, sourceText: next })}
          placeholder="输入要翻译的文本..."
          minHeight={74}
          height={sourceHeight}
          onHeightCommit={(nextHeight) => onStateChange({ ...instance.state, sourceHeight: nextHeight })}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(203, 213, 225, 0.65)",
            padding: "8px 10px",
            background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            marginBottom: 8
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <button
              type="button"
              onClick={() => void pasteSourceText()}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                width: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#475569",
                cursor: "pointer"
              }}
              title="粘贴剪贴板内容"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M5.5 2.5H4.75A1.75 1.75 0 0 0 3 4.25v7A1.75 1.75 0 0 0 4.75 13h6.5A1.75 1.75 0 0 0 13 11.25v-7A1.75 1.75 0 0 0 11.25 2.5H10.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 2.75C6 2.06 6.56 1.5 7.25 1.5h1.5C9.44 1.5 10 2.06 10 2.75v.5H6v-.5Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Button
              onClick={() => {
                if (!sourceText.trim()) return;
                onStateChange({ ...instance.state, translating: true, translateError: "" });
                void quickTranslate(sourceText, sourceLang, targetLang)
                  .then((text) => {
                    const currentHistory = (Array.isArray(instance.state.translateHistory)
                      ? instance.state.translateHistory
                      : []) as TranslateHistoryItem[];
                    const currentIndex = Number(instance.state.translateHistoryIndex ?? (currentHistory.length ? currentHistory.length - 1 : -1));
                    const normalizedIndex = Number.isFinite(currentIndex) ? currentIndex : currentHistory.length - 1;
                    const baseHistory =
                      normalizedIndex >= 0 && normalizedIndex < currentHistory.length - 1
                        ? currentHistory.slice(0, normalizedIndex + 1)
                        : currentHistory;
                    const nextHistory = [
                      ...baseHistory,
                      {
                        sourceText,
                        translatedText: text,
                        sourceLang,
                        targetLang,
                        translatedAt: new Date().toISOString()
                      }
                    ];
                    onStateChange({
                      ...instance.state,
                      translating: false,
                      translateError: "",
                      translatedText: text,
                      translateHistory: nextHistory,
                      translateHistoryIndex: nextHistory.length - 1
                    });
                  })
                  .catch((error) => {
                    onStateChange({
                      ...instance.state,
                      translating: false,
                      translateError: error instanceof Error ? error.message : "翻译失败"
                    });
                  });
              }}
            >
              {translating ? "…" : "⇢"}
            </Button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (!canPrev) return;
                const nextIndex = historyIndex - 1;
                const item = history[nextIndex];
                if (!item) return;
                onStateChange({
                  ...instance.state,
                  sourceText: item.sourceText,
                  translatedText: item.translatedText,
                  sourceLang: item.sourceLang,
                  targetLang: item.targetLang,
                  translateHistoryIndex: nextIndex
                });
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                minWidth: 12,
                color: canPrev ? "#0f172a" : "#94a3b8",
                cursor: canPrev ? "pointer" : "default",
                fontSize: 12,
                lineHeight: 1
              }}
              title="上一条翻译"
            >
              ◀
            </button>
            <button
              onClick={() => {
                if (!canNext) return;
                const nextIndex = historyIndex + 1;
                const item = history[nextIndex];
                if (!item) return;
                onStateChange({
                  ...instance.state,
                  sourceText: item.sourceText,
                  translatedText: item.translatedText,
                  sourceLang: item.sourceLang,
                  targetLang: item.targetLang,
                  translateHistoryIndex: nextIndex
                });
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                minWidth: 12,
                color: canNext ? "#0f172a" : "#94a3b8",
                cursor: canNext ? "pointer" : "default",
                fontSize: 12,
                lineHeight: 1
              }}
              title="下一条翻译"
            >
              ▶
            </button>
          </div>
        </div>
        {translateError ? <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>{translateError}</div> : null}
        <VerticalResizableTextarea
          value={translatedText || "翻译结果会显示在这里"}
          readOnly
          minHeight={74}
          height={resultHeight}
          onHeightCommit={(nextHeight) => onStateChange({ ...instance.state, resultHeight: nextHeight })}
          style={{
            display: "block",
            boxSizing: "border-box",
            borderRadius: 12,
            border: "1px solid rgba(203, 213, 225, 0.65)",
            padding: "8px 10px",
            color: "#0f172a",
            background: "linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))"
          }}
        />
      </WidgetShell>
    );
  }

  if (definition.type === "messageBoard") {
    const { user } = useAuthStore();
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<MessageBoardItem[]>([]);
    const [sending, setSending] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [channelReady, setChannelReady] = useState(false);
    const [messageError, setMessageError] = useState("");
    const [channelStatusText, setChannelStatusText] = useState("连接中...");
    const [retrySeed, setRetrySeed] = useState(0);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const latestMessageIdRef = useRef("");
    const initializedMessageRef = useRef(false);
    const historyLoadedRef = useRef(false);
    const userId = user?.id ?? "";
    const userName = resolveUserName({
      email: user?.email ?? null,
      userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
    });

    useEffect(() => {
      const latest = messages[0];
      if (!latest) return;
      if (!initializedMessageRef.current) {
        initializedMessageRef.current = true;
        latestMessageIdRef.current = latest.id;
        return;
      }
      if (latest.id === latestMessageIdRef.current) {
        return;
      }
      latestMessageIdRef.current = latest.id;
      if (latest.senderId === userId) {
        return;
      }
      void playMessageBoardChime().catch((error) => {
        console.warn("[messageBoard] chime failed", error);
      });
    }, [messages, userId]);

    useEffect(() => {
      const unlock = () => {
        void primeMessageBoardAudio().catch((error) => {
          console.warn("[messageBoard] audio unlock failed", error);
        });
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock);
      window.addEventListener("touchstart", unlock, { passive: true });
      return () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
      };
    }, []);

    useEffect(() => {
      if (!userId) return;
      let cancelled = false;
      historyLoadedRef.current = false;
      setHistoryLoading(true);
      void (async () => {
        try {
          const history = await fetchMessageBoardHistory();
          if (cancelled) return;
          historyLoadedRef.current = true;
          setMessageError("");
          setMessages((prev) => normalizeMessageList([...history, ...prev]));
        } catch (error) {
          if (cancelled) return;
          setMessageError(error instanceof Error ? `历史加载失败：${error.message}` : "历史加载失败");
        } finally {
          if (!cancelled) {
            setHistoryLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [userId]);

    useEffect(() => {
      if (!userId) return;
      let disposed = false;
      const syncHistory = () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        void fetchMessageBoardHistory()
          .then((history) => {
            if (disposed) return;
            setMessages((prev) => normalizeMessageList([...history, ...prev]));
          })
          .catch((error) => {
            if (disposed) return;
            console.warn("[messageBoard] poll history failed", error);
          });
      };
      const timer = window.setInterval(syncHistory, 2500);
      return () => {
        disposed = true;
        window.clearInterval(timer);
      };
    }, [userId]);

    useEffect(() => {
      if (!userId) return;

      const channel = supabase.channel(MESSAGE_BOARD_CHANNEL, {
        config: { broadcast: { self: true, ack: true } }
      });
      let retryTimer: number | null = null;
      let disposed = false;
      const scheduleRetry = () => {
        if (disposed || retryTimer !== null) return;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (!disposed) {
            setRetrySeed((prev) => prev + 1);
          }
        }, 1000);
      };
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const message = payload as MessageBoardItem;
          if (!message || typeof message.text !== "string") return;
          setMessages((prev) => normalizeMessageList([message, ...prev]));
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_board_messages" }, ({ new: row }) => {
          const message = messageFromRow(row as MessageBoardRow);
          setMessages((prev) => normalizeMessageList([message, ...prev]));
        })
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setChannelReady(true);
            setChannelStatusText("已连接");
            setMessageError("");
            if (historyLoadedRef.current) {
              return;
            }
            void (async () => {
              try {
                const history = await fetchMessageBoardHistory();
                if (disposed) return;
                historyLoadedRef.current = true;
                setMessages((prev) => normalizeMessageList([...history, ...prev]));
              } catch (error) {
                if (disposed) return;
                setMessageError(error instanceof Error ? `历史同步失败：${error.message}` : "历史同步失败");
              }
            })();
            return;
          }
          if (status === "CHANNEL_ERROR") {
            setChannelReady(false);
            setChannelStatusText("连接中...");
            scheduleRetry();
            return;
          }
          if (status === "TIMED_OUT") {
            setChannelReady(false);
            setChannelStatusText("连接中...");
            scheduleRetry();
            return;
          }
          if (status === "CLOSED") {
            setChannelReady(false);
            setChannelStatusText("连接中...");
            return;
          }
          setChannelReady(false);
          setChannelStatusText("连接中...");
        });

      return () => {
        disposed = true;
        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
        }
        setChannelReady(false);
        setChannelStatusText("连接中...");
        channelRef.current = null;
        void supabase.removeChannel(channel);
      };
    }, [userId, retrySeed]);

    const sendMessage = () => {
      const text = draft.trim();
      if (!text) return;
      const message: MessageBoardItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        senderId: userId,
        senderName: userName,
        text,
        createdAt: new Date().toISOString()
      };
      setSending(true);
      setMessageError("");
      setMessages((prev) => normalizeMessageList([message, ...prev]));
      setDraft("");
      void (async () => {
        try {
          const { error } = await supabase.from("message_board_messages").insert({
            id: message.id,
            sender_id: message.senderId,
            sender_name: message.senderName,
            message: message.text,
            created_at: message.createdAt
          });
          if (error) {
            throw error;
          }
          const channel = channelRef.current;
          if (channel) {
            const result = await channel.send({
              type: "broadcast",
              event: "message",
              payload: message
            });
            if (result !== "ok" && channelReady) {
              console.warn("[messageBoard] broadcast send failed", result);
            }
          }
        } catch (error) {
          setMessages((prev) => prev.filter((item) => item.id !== message.id));
          setDraft(text);
          setMessageError(error instanceof Error ? `发送失败：${error.message}` : "发送失败，请重试");
        } finally {
          setSending(false);
        }
      })();
    };

    return (
      <WidgetShell
        definition={definition}
        instance={instance}
        cardStyle={
          isMobileMode
            ? {
                height: "auto",
                minHeight: 260,
                maxHeight: 480,
                overflow: "hidden"
              }
            : {
                height: "100%",
                minHeight: 0,
                overflow: "hidden"
              }
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flex: 1,
            minHeight: 0
          }}
        >
          <div style={{ fontSize: 10, color: "#64748b" }}>
            状态：{channelStatusText}（当前用户：{userName}）
          </div>
          {messageError ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{messageError}</div> : null}
          <div
            className="glass-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              paddingRight: 2
            }}
          >
            {messages.length > 0 ? (
              messages.map((item) => (
                <div
                  key={item.id}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    color: colorForUser(item.senderId || item.senderName)
                  }}
                >
                  <strong>{item.senderName || "匿名用户"}</strong>
                  <span style={{ opacity: 0.9 }}>：{item.text}</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {historyLoading ? "正在加载历史留言..." : "还没有留言，来发布第一条吧。"}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end", marginTop: "auto" }}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="输入留言，按 Enter 发送"
              style={{
                minHeight: 54,
                resize: "none",
                borderRadius: 12,
                border: "1px solid rgba(203,213,225,0.72)",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
                padding: "8px 10px",
                color: "#0f172a",
                fontSize: 12
              }}
            />
            <Button onClick={sendMessage}>{sending ? "发送中..." : "发送"}</Button>
          </div>
        </div>
      </WidgetShell>
    );
  }

  if (definition.type === "gomoku") {
    return (
      <GomokuWidget
        definition={definition}
        instance={instance}
        isMobileMode={isMobileMode}
        onStateChange={onStateChange}
      />
    );
  }

  if (definition.type === "monopoly") {
    return (
      <MonopolyWidget
        definition={definition}
        instance={instance}
        isMobileMode={isMobileMode}
        onStateChange={onStateChange}
      />
    );
  }

  if (definition.type === "guandan") {
    return (
      <GuandanWidget
        definition={definition}
        instance={instance}
        isMobileMode={isMobileMode}
        onStateChange={onStateChange}
      />
    );
  }

  if (definition.type === "recorder") {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const wakeLockRef = useRef<RecorderWakeLockSentinel | null>(null);
    const recordings = (Array.isArray(instance.state.recordings) ? instance.state.recordings : []) as RecordingItem[];
    const recording = instance.state.recording === true;
    const [playingId, setPlayingId] = useState("");
    const [progressMap, setProgressMap] = useState<Record<string, number>>({});
    const [wakeLockStatus, setWakeLockStatus] = useState<"idle" | "active" | "unsupported" | "failed">("idle");

    useEffect(() => {
      const releaseWakeLock = async () => {
        const sentinel = wakeLockRef.current;
        wakeLockRef.current = null;
        if (!sentinel) return;
        try {
          await sentinel.release();
        } catch {
          // Ignore release failures because the browser may have already released it.
        }
      };

      if (!recording) {
        setWakeLockStatus("idle");
        void releaseWakeLock();
        return;
      }

      let disposed = false;

      const requestWakeLock = async () => {
        const wakeLockApi = getScreenWakeLockApi();
        if (!wakeLockApi) {
          if (!disposed) {
            setWakeLockStatus("unsupported");
          }
          return;
        }
        try {
          const sentinel = await wakeLockApi.request("screen");
          if (disposed) {
            await sentinel.release().catch(() => undefined);
            return;
          }
          wakeLockRef.current = sentinel;
          setWakeLockStatus("active");
          sentinel.addEventListener?.("release", () => {
            if (wakeLockRef.current === sentinel) {
              wakeLockRef.current = null;
            }
            if (!disposed && document.visibilityState === "visible") {
              setWakeLockStatus("failed");
            }
          });
        } catch {
          if (!disposed) {
            setWakeLockStatus("failed");
          }
        }
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible" && !wakeLockRef.current) {
          void requestWakeLock();
        }
      };

      void requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        disposed = true;
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        void releaseWakeLock();
      };
    }, [recording]);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <button
            onClick={() => {
              if (recording) {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
                return;
              }
              void (async () => {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  streamRef.current = stream;
                  chunksRef.current = [];
                  const recorder = new MediaRecorder(stream);
                  mediaRecorderRef.current = recorder;
                  recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) chunksRef.current.push(event.data);
                  };
                  recorder.onstop = () => {
                    void (async () => {
                      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                      const dataUrl = await blobToDataUrl(blob);
                      const createdAt = new Date().toISOString();
                      const nextRecordings = [
                        {
                          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          createdAt,
                          name: `录音 ${new Date(createdAt).toLocaleTimeString()}`,
                          dataUrl,
                          mimeType: recorder.mimeType || "audio/webm"
                        },
                        ...recordings
                      ];
                      onStateChange({
                        ...instance.state,
                        recording: false,
                        recordings: nextRecordings
                      });
                      streamRef.current?.getTracks().forEach((track) => track.stop());
                      streamRef.current = null;
                    })();
                  };
                  recorder.start();
                  onStateChange({ ...instance.state, recording: true, recordError: "" });
                } catch (error) {
                  onStateChange({
                    ...instance.state,
                    recording: false,
                    recordError: error instanceof Error ? error.message : "无法启动录音"
                  });
                }
              })();
            }}
            title={recording ? "停止录音" : "开始录音"}
            style={{
              width: recording ? 27 : 33,
              height: recording ? 27 : 33,
              borderRadius: recording ? 4 : "50%",
              border: recording ? "1px solid rgba(15,23,42,0.9)" : "1px solid rgba(248,113,113,0.95)",
              background: recording
                ? "linear-gradient(165deg, rgba(15,23,42,0.96), rgba(0,0,0,0.9))"
                : "linear-gradient(165deg, rgba(248,113,113,0.96), rgba(220,38,38,0.92))",
              boxShadow: recording
                ? "0 4px 10px rgba(0,0,0,0.35)"
                : "0 4px 10px rgba(220,38,38,0.35)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1
            }}
          />
        </div>

        {recording ? <div style={{ color: "#fda4af", marginBottom: 8, textAlign: "center" }}>录音中...</div> : null}
        {recording && wakeLockStatus === "active" ? (
          <div style={{ color: "#64748b", marginBottom: 8, textAlign: "center", fontSize: 11 }}>
            已尝试保持屏幕常亮；锁屏或切后台后，浏览器仍可能中断录音。
          </div>
        ) : null}
        {recording && wakeLockStatus !== "idle" && wakeLockStatus !== "active" ? (
          <div style={{ color: "#b45309", marginBottom: 8, textAlign: "center", fontSize: 11 }}>
            当前浏览器无法稳定保持常亮，请保持页面前台并关闭自动锁屏。
          </div>
        ) : null}
        {asString(instance.state.recordError) ? (
          <div style={{ color: "#b91c1c", marginBottom: 8 }}>{asString(instance.state.recordError)}</div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {recordings.length === 0 ? null : (
            recordings.map((item, index) => (
              <div
                key={item.id}
                style={{
                  padding: "3px 2px 5px",
                  minHeight: 28,
                  borderBottom: "1px solid rgba(100, 116, 139, 0.22)",
                  display: "block"
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {asString(instance.state.editingRecordingId) === item.id ? (
                    <input
                      autoFocus
                      value={asString(instance.state.editingRecordingName)}
                      onChange={(event) => onStateChange({ ...instance.state, editingRecordingName: event.target.value })}
                      onBlur={() => {
                        const nextName = asString(instance.state.editingRecordingName).trim();
                        onStateChange({
                          ...instance.state,
                          editingRecordingId: "",
                          editingRecordingName: "",
                          recordings: recordings.map((record) =>
                            record.id === item.id ? { ...record, name: nextName || record.name || "录音" } : record
                          )
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          const nextName = asString(instance.state.editingRecordingName).trim();
                          onStateChange({
                            ...instance.state,
                            editingRecordingId: "",
                            editingRecordingName: "",
                            recordings: recordings.map((record) =>
                              record.id === item.id ? { ...record, name: nextName || record.name || "录音" } : record
                            )
                          });
                        }
                      }}
                      style={{
                        width: "100%",
                        border: "1px solid rgba(148,163,184,0.42)",
                        borderRadius: 6,
                        padding: "2px 6px",
                        fontSize: 11,
                        background: "rgba(255,255,255,0.8)"
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={() => {
                        onStateChange({
                          ...instance.state,
                          editingRecordingId: item.id,
                          editingRecordingName: item.name ?? `录音 ${recordings.length - index}`
                        });
                      }}
                      style={{
                        fontSize: 11,
                        color: "#334155",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: "text"
                      }}
                      title="双击编辑名称"
                    >
                      {item.name ?? `录音 ${recordings.length - index}`} · {new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <button
                      onClick={() => {
                        const audio = audioRefs.current[item.id];
                        if (!audio) return;
                        if (playingId === item.id) {
                          audio.pause();
                          setPlayingId("");
                          return;
                        }
                        Object.entries(audioRefs.current).forEach(([id, target]) => {
                          if (id !== item.id && target) {
                            target.pause();
                          }
                        });
                        void audio.play();
                        setPlayingId(item.id);
                        audio.onended = () => {
                          setPlayingId("");
                        };
                      }}
                      className="recorder-play-btn"
                      title={playingId === item.id ? "暂停" : "播放"}
                    >
                      {renderMediaControlIcon(playingId === item.id ? "pause" : "play")}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.1}
                      value={progressMap[item.id] ?? 0}
                      onChange={(event) => {
                        const audio = audioRefs.current[item.id];
                        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
                        const percent = Number(event.target.value);
                        audio.currentTime = (percent / 100) * audio.duration;
                        setProgressMap((prev) => ({ ...prev, [item.id]: percent }));
                      }}
                      className="recorder-progress-line"
                    />
                    <button
                      onClick={() => {
                        const anchor = document.createElement("a");
                        anchor.href = item.dataUrl;
                        anchor.download = `recording-${new Date(item.createdAt).toISOString()}.webm`;
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#64748b",
                        cursor: "pointer",
                        fontSize: 12,
                        lineHeight: 1,
                        padding: 0
                      }}
                      title="下载"
                    >
                      <span className="icon-download-mark">
                        <span>↓</span>
                        <i />
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        const nextRecordings = recordings.filter((record) => record.id !== item.id);
                        const audio = audioRefs.current[item.id];
                        if (audio) {
                          audio.pause();
                          audio.currentTime = 0;
                        }
                        if (playingId === item.id) {
                          setPlayingId("");
                        }
                        onStateChange({
                          ...instance.state,
                          recordings: nextRecordings
                        });
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#b91c1c",
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1,
                        padding: 0
                      }}
                      title="删除"
                    >
                      🗑
                    </button>
                  </div>
                  <audio
                    ref={(el) => {
                      audioRefs.current[item.id] = el;
                      if (el) {
                        el.ontimeupdate = () => {
                          if (!Number.isFinite(el.duration) || el.duration <= 0) return;
                          const percent = (el.currentTime / el.duration) * 100;
                          setProgressMap((prev) => ({ ...prev, [item.id]: percent }));
                        };
                      }
                    }}
                    src={item.dataUrl}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell definition={definition} instance={instance}>
      <p>未实现的系统 Widget: {definition.type}</p>
    </WidgetShell>
  );
}

export function AIFormWidgetView({
  definition,
  instance,
  onStateChange
}: {
  definition: WidgetDefinition;
  instance: WidgetInstance;
  onStateChange: (nextState: Record<string, unknown>) => void;
}) {
  return (
    <WidgetShell definition={definition} instance={instance}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const message = definition.logicSpec.onSubmit?.message ?? "提交成功";
          onStateChange({ ...instance.state, _lastMessage: message });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {definition.inputSchema.fields.map((field) => {
          const common = {
            key: field.key,
            value: (instance.state[field.key] as string | number | undefined) ?? "",
            onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
              onStateChange({ ...instance.state, [field.key]: event.target.value }),
            style: {
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "6px 8px",
              width: "100%"
            }
          };

          if (field.type === "textarea") {
            const heightKey = `__textarea_h_${field.key}`;
            const height = Number((instance.state[heightKey] as number | undefined) ?? 110);
            return (
              <VerticalResizableTextarea
                value={String((instance.state[field.key] as string | undefined) ?? "")}
                onCommit={(next) => onStateChange({ ...instance.state, [field.key]: next })}
                placeholder={field.placeholder}
                minHeight={90}
                height={height}
                onHeightCommit={(nextHeight) => onStateChange({ ...instance.state, [heightKey]: nextHeight })}
                style={{
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  padding: "6px 8px",
                  width: "100%",
                  background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
                }}
              />
            );
          }
          if (field.type === "select") {
            const selectOptions = (field.options ?? []).map((option) => ({ value: option, label: option }));
            return (
              <GlassSelect
                value={String(common.value)}
                onChange={(next) => onStateChange({ ...instance.state, [field.key]: next })}
                options={selectOptions}
              />
            );
          }
          return <input {...common} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} />;
        })}
        <Button type="submit">提交</Button>
        {instance.state._lastMessage ? (
          <div style={{ color: "#0f766e", fontSize: 12 }}>{String(instance.state._lastMessage)}</div>
        ) : null}
      </form>
    </WidgetShell>
  );
}

function mediaIconBtnStyle({
  size,
  fontSize
}: {
  size: number;
  fontSize: number;
}): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: "#0f172a",
    fontSize,
    lineHeight: 1,
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    boxShadow: "none"
  };
}

function renderMediaControlIcon(kind: "play" | "pause" | "reset") {
  if (kind === "play") {
    return (
      <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden="true">
        <path d="M2 1.6L9 6L2 10.4V1.6Z" fill="#0f172a" />
      </svg>
    );
  }
  if (kind === "pause") {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2
        }}
      >
        <span style={{ width: 3, height: 12, borderRadius: 999, background: "#0f172a", display: "block" }} />
        <span style={{ width: 3, height: 12, borderRadius: 999, background: "#0f172a", display: "block" }} />
      </span>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.5 7A4.5 4.5 0 1 1 7 2.5c1.2 0 2.28.47 3.08 1.24"
        stroke="#0f172a"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 2.75v2.5H9" stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
