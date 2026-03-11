export const CHINA_TIME_ZONE = "Asia/Shanghai";

export interface WorldClockZoneOption {
  value: string;
  label: string;
  shortLabel: string;
}

export interface WorldClockDisplay {
  time: string;
  zoneName: string;
  offset: string;
}

export const WORLD_CLOCK_ZONE_OPTIONS: WorldClockZoneOption[] = [
  { value: CHINA_TIME_ZONE, label: "北京", shortLabel: "北京" },
  { value: "America/Los_Angeles", label: "洛杉矶", shortLabel: "洛杉矶" },
  { value: "America/New_York", label: "纽约", shortLabel: "纽约" },
  { value: "Europe/London", label: "伦敦", shortLabel: "伦敦" },
  { value: "Europe/Paris", label: "巴黎", shortLabel: "巴黎" },
  { value: "Europe/Berlin", label: "柏林", shortLabel: "柏林" },
  { value: "Asia/Tokyo", label: "东京", shortLabel: "东京" },
  { value: "Asia/Seoul", label: "首尔", shortLabel: "首尔" },
  { value: "Asia/Singapore", label: "新加坡", shortLabel: "新加坡" },
  { value: "Asia/Dubai", label: "迪拜", shortLabel: "迪拜" },
  { value: "Australia/Sydney", label: "悉尼", shortLabel: "悉尼" }
] as const;

export const DEFAULT_WORLD_CLOCK_ZONES = [
  CHINA_TIME_ZONE,
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London"
] as const;

export const WORLD_CLOCK_GLOW_TONES = [
  "world-clock-tone-sun",
  "world-clock-tone-mint",
  "world-clock-tone-blue",
  "world-clock-tone-rose"
] as const;

const VALID_ZONE_SET = new Set(WORLD_CLOCK_ZONE_OPTIONS.map((item) => item.value));

function createFallbackPool(exclude: readonly string[] = []): string[] {
  const pool: string[] = [];
  [...DEFAULT_WORLD_CLOCK_ZONES, ...WORLD_CLOCK_ZONE_OPTIONS.map((item) => item.value)].forEach((zone) => {
    if (zone === CHINA_TIME_ZONE || exclude.includes(zone) || pool.includes(zone)) {
      return;
    }
    pool.push(zone);
  });
  return pool;
}

export function normalizeWorldClockZones(input: unknown, fallback: readonly string[] = DEFAULT_WORLD_CLOCK_ZONES): string[] {
  const source = Array.isArray(input) ? input : fallback;
  const cleaned = source.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const unique: string[] = [CHINA_TIME_ZONE];

  cleaned.forEach((zone) => {
    if (!VALID_ZONE_SET.has(zone) || zone === CHINA_TIME_ZONE || unique.includes(zone)) {
      return;
    }
    unique.push(zone);
  });

  const fallbackPool = createFallbackPool(unique);
  while (unique.length < 4 && fallbackPool.length > 0) {
    const next = fallbackPool.shift();
    if (next) {
      unique.push(next);
    }
  }

  return unique.slice(0, 4);
}

export function toWorldClockSlots(zones: readonly string[]): string[] {
  return normalizeWorldClockZones(zones);
}

export function updateWorldClockSlot(zones: readonly string[], slotIndex: number, nextZone: string): string[] {
  const slots = toWorldClockSlots(zones);
  if (slotIndex <= 0 || slotIndex >= slots.length) {
    return slots;
  }

  const sanitized = nextZone.trim();
  if (!VALID_ZONE_SET.has(sanitized) || sanitized === CHINA_TIME_ZONE || slots.includes(sanitized)) {
    return slots;
  }

  const nextSlots = [...slots];
  nextSlots[slotIndex] = sanitized;
  return normalizeWorldClockZones(nextSlots);
}

export function getWorldClockLayoutClass(count: number): string {
  return "world-clock-grid-quad";
}

export function getWorldClockOptionLabel(timeZone: string): string {
  return WORLD_CLOCK_ZONE_OPTIONS.find((item) => item.value === timeZone)?.label ?? timeZone;
}

export function getRandomWorldClockToneClasses(): string[] {
  const pool = [...WORLD_CLOCK_GLOW_TONES];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function formatFromParts(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone
  }).format(date);
}

function formatTimeZoneName(date: Date, timeZone: string, timeZoneName: "short" | "shortOffset"): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

export function formatWorldClockDisplay(date: Date, timeZone: string): WorldClockDisplay {
  const time = formatFromParts(date, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const zoneNameRaw = formatTimeZoneName(date, timeZone, "short").trim();
  const offsetRaw = formatTimeZoneName(date, timeZone, "shortOffset");
  const offsetMatch = offsetRaw.match(/GMT(?:[+-]\d{1,2}(?::\d{2})?)?/);

  return {
    time,
    zoneName: zoneNameRaw || getWorldClockOptionLabel(timeZone),
    offset: offsetMatch?.[0] ?? "GMT"
  };
}
