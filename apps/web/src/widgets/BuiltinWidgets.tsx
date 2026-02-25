import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Button } from "@xiaozhuoban/ui";
import { WidgetShell } from "./WidgetShell";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((i) => typeof i === "string") as string[] : [];
}

const MAJOR_CITIES = [
  { value: "beijing", label: "北京", latitude: 39.9042, longitude: 116.4074 },
  { value: "shanghai", label: "上海", latitude: 31.2304, longitude: 121.4737 },
  { value: "guangzhou", label: "广州", latitude: 23.1291, longitude: 113.2644 },
  { value: "shenzhen", label: "深圳", latitude: 22.5431, longitude: 114.0579 },
  { value: "hangzhou", label: "杭州", latitude: 30.2741, longitude: 120.1551 },
  { value: "chengdu", label: "成都", latitude: 30.5728, longitude: 104.0668 },
  { value: "wuhan", label: "武汉", latitude: 30.5928, longitude: 114.3055 },
  { value: "chongqing", label: "重庆", latitude: 29.4316, longitude: 106.9123 },
  { value: "nanjing", label: "南京", latitude: 32.0603, longitude: 118.7969 },
  { value: "xian", label: "西安", latitude: 34.3416, longitude: 108.9398 }
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

const SELECT_CHEVRON_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2364758b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E\")";

const glassSelectStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(203, 213, 225, 0.65)",
  padding: "6px 34px 6px 10px",
  width: "100%",
  minWidth: 86,
  color: "#0f172a",
  lineHeight: 1.35,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage: `${SELECT_CHEVRON_ICON}, linear-gradient(160deg, rgba(255,255,255,0.68), rgba(255,255,255,0.36))`,
  backgroundRepeat: "no-repeat, no-repeat",
  backgroundPosition: "right 14px center, 0 0",
  backgroundSize: "12px 12px, 100% 100%",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 12px rgba(15,23,42,0.06)"
};

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
  url: string;
  source: string;
  time: string;
}

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

  const minuteUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(marketCode)}`;
  const minuteResponse = await fetch(minuteUrl);
  if (!minuteResponse.ok) {
    throw new Error(`行情请求失败 (${minuteResponse.status})`);
  }
  const minutePayload = (await minuteResponse.json()) as {
    code?: number;
    data?: Record<string, { data?: { data?: string[] }; qt?: Record<string, unknown> }>;
  };
  if (minutePayload.code !== 0 || !minutePayload.data?.[marketCode]) {
    throw new Error("指数数据不可用");
  }

  const node = minutePayload.data[marketCode];
  const minuteLines = Array.isArray(node.data?.data) ? node.data?.data ?? [] : [];
  let pointSeries = minuteLines
    .map((line) => {
      const [time, price] = line.trim().split(/\s+/);
      return { t: toMinute(time), v: Number(price) };
    })
    .filter((item) => item.t !== null && Number.isFinite(item.v) && item.v > 0) as Array<{ t: number; v: number }>;

  const qtRaw = node.qt?.[marketCode];
  const qtArray = Array.isArray(qtRaw) ? qtRaw : [];
  const lastFromQt = Number(qtArray[3]);
  const prevFromQt = Number(qtArray[4]);

  let dayRows: string[][] = [];
  const dailyUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    marketCode
  )},day,,,40,qfq`;
  const dailyResponse = await fetch(dailyUrl);
  if (dailyResponse.ok) {
    const dailyPayload = (await dailyResponse.json()) as {
      code?: number;
      data?: Record<string, { day?: string[][] }>;
    };
    dayRows = dailyPayload.data?.[marketCode]?.day ?? [];
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
  if (!inTradingNow && dayRows.length > 0) {
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
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
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
      .slice(0, 9);
  };

  try {
    const reuters = await fromRss(
      "https://www.reutersagency.com/feed/?best-topics=top-news&post_type=best",
      "Reuters"
    );
    if (reuters.length > 0) {
      return reuters;
    }
  } catch {
    // fallback to BBC
  }

  const bbc = await fromRss("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC");
  if (bbc.length > 0) {
    return bbc;
  }

  throw new Error("Reuters/BBC 新闻源暂无可用数据");
}

interface TodoItem {
  id: string;
  text: string;
  dueAt?: string;
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

interface RecordingItem {
  id: string;
  createdAt: string;
  name?: string;
  dataUrl: string;
  mimeType: string;
}

interface ClipboardRecord {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
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
  style
}: {
  value: string;
  onCommit?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
  height: number;
  onHeightCommit: (height: number) => void;
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
  }, [minHeight, onHeightCommit]);

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
    </div>
  );
}

export function BuiltinWidgetView({
  definition,
  instance,
  onStateChange
}: {
  definition: WidgetDefinition;
  instance: WidgetInstance;
  onStateChange: (nextState: Record<string, unknown>) => void;
}) {
  if (definition.type === "note") {
    const noteText = asString(instance.state.content);
    const noteHeight = Number(instance.state.noteHeight ?? 110);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <VerticalResizableTextarea
          value={noteText}
          onCommit={(next) => onStateChange({ ...instance.state, content: next })}
          placeholder="在这里记录你的想法..."
          minHeight={90}
          height={noteHeight}
          onHeightCommit={(nextHeight) => onStateChange({ ...instance.state, noteHeight: nextHeight })}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(250, 204, 21, 0.5)",
            padding: "6px 8px",
            background: "linear-gradient(165deg, rgba(255, 247, 196, 0.68), rgba(255, 233, 133, 0.46))"
          }}
        />
      </WidgetShell>
    );
  }

  if (definition.type === "todo") {
    const items = (Array.isArray(instance.state.items) ? instance.state.items : []) as TodoItem[];
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
    const inputHours = Number(instance.state.inputHours ?? 0);
    const inputMinutes = Number(instance.state.inputMinutes ?? 5);
    const inputSeconds = Number(instance.state.inputSeconds ?? 0);
    const running = instance.state.running === true;
    const totalSeconds = Number(instance.state.totalSeconds ?? inputHours * 3600 + inputMinutes * 60 + inputSeconds);
    const remainingSeconds = Number(instance.state.remainingSeconds ?? totalSeconds);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <input
              type="number"
              min={0}
              max={99}
              value={inputHours}
              onChange={(event) => onStateChange({ ...instance.state, inputHours: Number(event.target.value || 0) })}
              placeholder="时"
              style={{
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
            <input
              type="number"
              min={0}
              max={59}
              value={inputMinutes}
              onChange={(event) => onStateChange({ ...instance.state, inputMinutes: Number(event.target.value || 0) })}
              placeholder="分"
              style={{
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
            <input
              type="number"
              min={0}
              max={59}
              value={inputSeconds}
              onChange={(event) => onStateChange({ ...instance.state, inputSeconds: Number(event.target.value || 0) })}
              placeholder="秒"
              style={{
                borderRadius: 10,
                border: "1px solid rgba(203, 213, 225, 0.65)",
                padding: "6px 8px",
                background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 22, justifyContent: "center", alignItems: "center" }}>
            <button
              onClick={() => {
                const total = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
                onStateChange({
                  ...instance.state,
                  totalSeconds: total,
                  remainingSeconds: total,
                  running: total > 0
                });
              }}
              style={timerIconBtnStyle}
            >
              ▶
            </button>
            <button
              onClick={() => {
                onStateChange({ ...instance.state, running: false });
              }}
              style={timerIconBtnStyle}
            >
              ⏸
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
              style={timerIconBtnStyle}
            >
              ↺
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
      | { temperature: number; windSpeed: number; weatherCode: number; isDay: boolean; fetchedAt: string }
      | undefined;
    const loading = instance.state.weatherLoading === true;
    const error = asString(instance.state.weatherError);

    useEffect(() => {
      const city = MAJOR_CITIES.find((item) => item.value === selectedCityCode) ?? MAJOR_CITIES[1];
      let cancelled = false;

      onStateChange({ ...instance.state, weatherLoading: true, weatherError: "" });

      void fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("天气服务请求失败");
          }
          const payload = (await response.json()) as {
            current?: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number };
          };
          if (!payload.current) {
            throw new Error("天气数据为空");
          }
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
              fetchedAt: new Date().toISOString()
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

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ position: "relative", paddingTop: 4 }}>
          <div className="weather-anim" title={weatherText}>
            {weatherIcon}
          </div>
          <select
            value={selectedCityCode}
            onChange={(event) => onStateChange({ ...instance.state, cityCode: event.target.value })}
            style={glassSelectStyle}
          >
            {MAJOR_CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, fontSize: 13, color: "#1f2937" }}>
            {loading ? (
              "正在获取实时天气..."
            ) : error ? (
              <span style={{ color: "#b91c1c" }}>{error}</span>
            ) : (
              <>
                <div>
                  {currentCity.label}：{weatherText}，{weather?.temperature ?? "--"}°C
                </div>
                <div style={{ color: "#64748b", marginTop: 4 }}>风速：{weather?.windSpeed ?? "--"} km/h</div>
              </>
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
    const [cursor, setCursor] = useState(0);

    useEffect(() => {
      let cancelled = false;
      const load = () => {
        onStateChange({
          ...instance.state,
          headlineLoading: true,
          headlineError: ""
        });
        void fetchMajorHeadlines()
          .then((items) => {
            if (cancelled) return;
            onStateChange({
              ...instance.state,
              headlineLoading: false,
              headlineError: "",
              headlines: items,
              headlineFetchedAt: new Date().toISOString()
            });
          })
          .catch((fetchError) => {
            if (cancelled) return;
            onStateChange({
              ...instance.state,
              headlineLoading: false,
              headlineError: fetchError instanceof Error ? fetchError.message : "获取新闻失败"
            });
          });
      };

      load();
      const timer = window.setInterval(load, 120_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
      // run once per widget instance
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (headlines.length <= 3) {
        setCursor(0);
        return;
      }
      const timer = window.setInterval(() => {
        setCursor((prev) => (prev + 1) % headlines.length);
      }, 15_000);
      return () => window.clearInterval(timer);
    }, [headlines.length]);

    const visible =
      headlines.length <= 3
        ? headlines
        : [0, 1, 2].map((offset) => headlines[(cursor - offset + headlines.length) % headlines.length]);

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gap: 8 }}>
          {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
          <div style={{ display: "grid", gap: 6, minHeight: 74 }}>
            {visible.map((item) => (
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
                {item.title.length > 26 ? (
                  <div className="headline-marquee">
                    <span className="headline-marquee-track">
                      <span>{item.title}</span>
                      <span aria-hidden="true">{item.title}</span>
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {item.title}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {item.source
                    ? `${item.source}${item.time ? ` · ${formatPublishedTime(item.time)}` : ""}`
                    : item.time
                      ? `${formatPublishedTime(item.time)}`
                      : ""}
                </div>
              </a>
            ))}
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
            <select value={addCode} onChange={(event) => setAddCode(event.target.value)} style={glassSelectStyle}>
              {GLOBAL_INDICES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  更新于 {new Date(data.fetchedAt).toLocaleTimeString()}
                </div>
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
      background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
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
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#111827",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: 0,
                    width: 16
                  }}
                  title={active && isPlaying ? "暂停" : "播放"}
                >
                  {active && isPlaying ? "⏸" : "▶"}
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
          <select
            value={category}
            onChange={(event) => {
              const nextCategory = event.target.value;
              const nextUnits = CONVERTER_UNIT_OPTIONS[nextCategory] ?? CONVERTER_UNIT_OPTIONS.length;
              onStateChange({
                ...instance.state,
                category: nextCategory,
                fromUnit: nextUnits[0]?.value ?? "",
                toUnit: nextUnits[1]?.value ?? nextUnits[0]?.value ?? ""
              });
            }}
            style={glassSelectStyle}
          >
            {CONVERTER_CATEGORY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

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
            <select
              value={fromUnit}
              onChange={(event) => onStateChange({ ...instance.state, fromUnit: event.target.value })}
              style={glassSelectStyle}
            >
              {units.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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
            <select
              value={toUnit}
              onChange={(event) => onStateChange({ ...instance.state, toUnit: event.target.value })}
              style={glassSelectStyle}
            >
              {units.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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

    return (
      <WidgetShell definition={definition} instance={instance}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <select
            value={sourceLang}
            onChange={(event) => onStateChange({ ...instance.state, sourceLang: event.target.value })}
            style={glassSelectStyle}
          >
            {TRANSLATE_LANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
          <select
            value={targetLang}
            onChange={(event) => onStateChange({ ...instance.state, targetLang: event.target.value })}
            style={glassSelectStyle}
          >
            {TRANSLATE_LANG_OPTIONS.filter((option) => option.value !== "auto").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 8 }}>
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
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

  if (definition.type === "recorder") {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const menuRootRef = useRef<HTMLDivElement | null>(null);
    const recordings = (Array.isArray(instance.state.recordings) ? instance.state.recordings : []) as RecordingItem[];
    const recording = instance.state.recording === true;
    const [playingId, setPlayingId] = useState("");
    const [progressMap, setProgressMap] = useState<Record<string, number>>({});
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
      const onDocClick = (event: MouseEvent) => {
        if (!menuRootRef.current) return;
        if (!menuRootRef.current.contains(event.target as Node)) {
          setOpenMenuId(null);
        }
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

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
        {asString(instance.state.recordError) ? (
          <div style={{ color: "#b91c1c", marginBottom: 8 }}>{asString(instance.state.recordError)}</div>
        ) : null}

        <div ref={menuRootRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {recordings.length === 0 ? null : (
            recordings.map((item, index) => (
              <div
                key={item.id}
                style={{
                  padding: "3px 2px 5px",
                  minHeight: 28,
                  borderBottom: "1px solid rgba(100, 116, 139, 0.22)",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 6
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
                      {playingId === item.id ? "⏸" : "▶"}
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
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setOpenMenuId((prev) => (prev === item.id ? null : item.id))}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#64748b",
                      fontSize: 14,
                      lineHeight: 1
                    }}
                  >
                    ⋮
                  </button>
                  {openMenuId === item.id ? (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 18,
                        border: "1px solid rgba(148,163,184,0.42)",
                        borderRadius: 8,
                        background: "linear-gradient(170deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))",
                        padding: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        zIndex: 2
                      }}
                    >
                      <button
                        onClick={() => {
                          const anchor = document.createElement("a");
                          anchor.href = item.dataUrl;
                          anchor.download = `recording-${new Date(item.createdAt).toISOString()}.webm`;
                          document.body.appendChild(anchor);
                          anchor.click();
                          anchor.remove();
                          setOpenMenuId(null);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#0f172a",
                          padding: "4px 8px",
                          textAlign: "center",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1
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
                          setOpenMenuId(null);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#b91c1c",
                          padding: "4px 8px",
                          textAlign: "center",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          fontWeight: 700
                        }}
                        title="删除"
                      >
                        🗑
                      </button>
                    </div>
                  ) : null}
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
            return (
              <select {...common} style={{ ...common.style, ...glassSelectStyle }}>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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

const timerIconBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#334155",
  fontSize: 18,
  lineHeight: 1,
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer"
};
