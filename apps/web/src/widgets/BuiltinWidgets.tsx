import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
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
    return (
      <WidgetShell definition={definition} instance={instance}>
        <ComposedInput
          value={asString(instance.state.content)}
          onCommit={(next) => onStateChange({ ...instance.state, content: next })}
          placeholder="在这里记录你的想法..."
          multiline
          style={{
            border: "1px solid rgba(250, 204, 21, 0.5)",
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
              +
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
            style={{
              borderRadius: 10,
              border: "1px solid rgba(203, 213, 225, 0.65)",
              padding: "6px 8px",
              width: "100%",
              background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))"
            }}
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
            return <textarea {...common} placeholder={field.placeholder} />;
          }
          if (field.type === "select") {
            return (
              <select {...common}>
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
