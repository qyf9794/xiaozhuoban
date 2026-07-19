import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { WorkbenchFileRole } from "@xiaozhuoban/workbench-core";
import { cancelWorkbenchTask, confirmWorkbenchTask } from "./taskClient";
import { createWorkbenchSignedUrl } from "./repository";
import { useWorkbenchStore, type WorkbenchPanel, type WorkbenchToolWindow } from "./store";

const panelLabels: Record<WorkbenchPanel, string> = {
  topic: "主题",
  resources: "资源",
  generated: "临时文件",
  records: "讨论记录"
};

function PanelHeader({
  panel,
  meta,
  children
}: {
  panel: WorkbenchPanel;
  meta?: string;
  children?: ReactNode;
}) {
  const fullscreenPanel = useWorkbenchStore((state) => state.fullscreenPanel);
  const setFullscreenPanel = useWorkbenchStore((state) => state.setFullscreenPanel);
  const setFocusedPanel = useWorkbenchStore((state) => state.setFocusedPanel);
  return (
    <header className="workbench-panel__header" onPointerDown={() => setFocusedPanel(panel)}>
      <div>
        <strong>{panelLabels[panel]}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      <div className="workbench-panel__actions">
        {children}
        <button
          type="button"
          className="workbench-icon-button"
          aria-label={fullscreenPanel === panel ? `退出${panelLabels[panel]}全屏` : `${panelLabels[panel]}全屏`}
          onClick={() => setFullscreenPanel(fullscreenPanel === panel ? null : panel)}
        >
          {fullscreenPanel === panel ? "↙" : "↗"}
        </button>
      </div>
    </header>
  );
}

function FileInputButton({ role, userId }: { role: WorkbenchFileRole; userId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFiles = useWorkbenchStore((state) => state.uploadFiles);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="workbench-icon-button"
        aria-label="添加文件"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "…" : "+"}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={(event) => {
          const files = event.target.files;
          if (!files?.length) return;
          setBusy(true);
          void uploadFiles(role, files, userId)
            .catch((error) => window.alert(error instanceof Error ? error.message : "文件上传失败"))
            .finally(() => {
              setBusy(false);
              event.target.value = "";
            });
        }}
      />
    </>
  );
}

function FileCards({ role }: { role: WorkbenchFileRole }) {
  const activeTopicId = useWorkbenchStore((state) => state.activeTopicId);
  const files = useWorkbenchStore((state) => state.files);
  const selectedFileId = useWorkbenchStore((state) => state.selectedFileId);
  const selectFile = useWorkbenchStore((state) => state.selectFile);
  const visible = files.filter((file) => file.topicId === activeTopicId && file.role === role);
  if (!visible.length) return <div className="workbench-empty">拖入文件，或点击右上角添加</div>;
  return (
    <div className={role === "primary" ? "workbench-topic-cards" : "workbench-file-grid"}>
      {visible.map((file) => {
        const legacy = /\.(doc|xls|ppt)$/i.test(file.name);
        return (
          <button
            type="button"
            key={file.id}
            className={`workbench-file-card ${selectedFileId === file.id ? "is-selected" : ""}`}
            onClick={() => selectFile(file.id)}
          >
            <span className="workbench-file-card__icon">{file.mimeType?.startsWith("image/") ? "▧" : "▤"}</span>
            <strong>{file.name}</strong>
            <small>{legacy ? "旧格式 · 仅保存/下载" : file.mimeType || "文件"}</small>
          </button>
        );
      })}
    </div>
  );
}

function SelectedFilePreview() {
  const selectedFileId = useWorkbenchStore((state) => state.selectedFileId);
  const file = useWorkbenchStore((state) => state.files.find((item) => item.id === selectedFileId));
  const [signedUrl, setSignedUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSignedUrl("");
    if (!file?.storagePath) return undefined;
    void createWorkbenchSignedUrl(file.storagePath)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file?.storagePath]);
  if (!file) return null;
  return (
    <aside className="workbench-file-preview" aria-label="文件预览">
      <header>
        <strong>{file.name}</strong>
        {signedUrl ? (
          <a href={signedUrl} target="_blank" rel="noreferrer">
            下载
          </a>
        ) : null}
      </header>
      {signedUrl && file.mimeType?.startsWith("image/") ? <img src={signedUrl} alt={file.name} /> : null}
      {file.extractedText ? <pre>{file.extractedText.slice(0, 8_000)}</pre> : null}
      {!file.extractedText && !file.mimeType?.startsWith("image/") ? <p>文件已安全保存。复杂分析将通过后台 GPT 读取授权内容。</p> : null}
    </aside>
  );
}

function TopicPanel({ userId, boardId }: { userId: string; boardId?: string }) {
  const fullscreenPanel = useWorkbenchStore((state) => state.fullscreenPanel);
  const topics = useWorkbenchStore((state) => state.topics);
  const activeTopicId = useWorkbenchStore((state) => state.activeTopicId);
  const selectTopic = useWorkbenchStore((state) => state.selectTopic);
  const createTopic = useWorkbenchStore((state) => state.createTopic);
  const allDirections = useWorkbenchStore((state) => state.directions);
  const addDirection = useWorkbenchStore((state) => state.addDirection);
  const toggleDirection = useWorkbenchStore((state) => state.toggleDirection);
  const [direction, setDirection] = useState("");
  const directions = useMemo(
    () => allDirections.filter((item) => item.topicId === activeTopicId),
    [activeTopicId, allDirections]
  );
  return (
    <section className={`workbench-panel workbench-topic-panel ${fullscreenPanel === "topic" ? "is-fullscreen" : ""}`} data-panel="topic">
      <PanelHeader panel="topic">
        <select value={activeTopicId ?? ""} aria-label="选择讨论主题" onChange={(event) => selectTopic(event.target.value)}>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="workbench-icon-button"
          aria-label="新建主题"
          onClick={() => {
            const title = window.prompt("新主题名称", "新讨论")?.trim();
            if (title) void createTopic(title, userId, boardId);
          }}
        >
          ＋
        </button>
        <FileInputButton role="primary" userId={userId} />
      </PanelHeader>
      <div className="workbench-topic-panel__body">
        <div className="workbench-agenda">
          <h3>{topics.find((topic) => topic.id === activeTopicId)?.title ?? "讨论主题"}</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = direction.trim();
              if (!value) return;
              void addDirection(value, userId).then(() => setDirection(""));
            }}
          >
            <input value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="添加讨论方向" />
            <button type="submit">添加</button>
          </form>
          <div className="workbench-directions">
            {directions.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.completed ? "is-complete" : ""}
                onClick={() => void toggleDirection(item.id)}
              >
                <span>{item.completed ? "✓" : "○"}</span>
                {item.text}
              </button>
            ))}
          </div>
        </div>
        <FileCards role="primary" />
        <SelectedFilePreview />
      </div>
    </section>
  );
}

function FilesPanel({ panel, role, userId }: { panel: "resources" | "generated"; role: "context" | "generated"; userId: string }) {
  const fullscreenPanel = useWorkbenchStore((state) => state.fullscreenPanel);
  const openToolWindow = useWorkbenchStore((state) => state.openToolWindow);
  return (
    <section className={`workbench-panel ${fullscreenPanel === panel ? "is-fullscreen" : ""}`} data-panel={panel}>
      <PanelHeader panel={panel} meta={role === "generated" ? "AI 结果与可编辑副本" : undefined}>
        {role === "generated" ? (
          <>
            <button type="button" className="workbench-icon-button" onClick={() => openToolWindow("whiteboard")} aria-label="打开白板">
              ✎
            </button>
            <button type="button" className="workbench-icon-button" onClick={() => openToolWindow("draft")} aria-label="打开草稿">
              ▤
            </button>
          </>
        ) : null}
        <FileInputButton role={role} userId={userId} />
      </PanelHeader>
      <div className="workbench-panel__scroll"><FileCards role={role} /></div>
    </section>
  );
}

function TaskList() {
  const activeTopicId = useWorkbenchStore((state) => state.activeTopicId);
  const allTasks = useWorkbenchStore((state) => state.tasks);
  const upsertTask = useWorkbenchStore((state) => state.upsertTask);
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.topicId || task.topicId === activeTopicId),
    [activeTopicId, allTasks]
  );
  const visible = tasks.slice(0, 8);
  if (!visible.length) return <div className="workbench-empty">语音或文本任务的状态会显示在这里</div>;
  return (
    <div className="workbench-task-list">
      {visible.map((task) => (
        <article key={task.id} className={`workbench-task is-${task.status}`}>
          <div><strong>{task.prompt}</strong><span>{task.status}</span></div>
          {task.reply ? <p>{task.reply}</p> : null}
          {task.error ? <p className="is-error">{task.error}</p> : null}
          <footer>
            {["queued", "running"].includes(task.status) ? (
              <button type="button" onClick={() => void cancelWorkbenchTask(task.id).then(upsertTask)}>取消</button>
            ) : null}
            {task.status === "awaiting_confirmation" ? (
              <button type="button" onClick={() => void confirmWorkbenchTask(task.id).then(upsertTask)}>确认执行</button>
            ) : null}
          </footer>
        </article>
      ))}
    </div>
  );
}

function RecordsPanel() {
  const fullscreenPanel = useWorkbenchStore((state) => state.fullscreenPanel);
  const activeTopicId = useWorkbenchStore((state) => state.activeTopicId);
  const allRecords = useWorkbenchStore((state) => state.records);
  const records = useMemo(
    () => allRecords.filter((record) => record.topicId === activeTopicId),
    [activeTopicId, allRecords]
  );
  return (
    <section className={`workbench-panel ${fullscreenPanel === "records" ? "is-fullscreen" : ""}`} data-panel="records">
      <PanelHeader panel="records" />
      <div className="workbench-panel__scroll">
        <TaskList />
        {records.map((record) => (
          <article className="workbench-record" key={record.id}>
            <strong>{record.title}</strong>
            <p>{record.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FloatingToolWindow({ tool, index }: { tool: WorkbenchToolWindow; index: number }) {
  const closeToolWindow = useWorkbenchStore((state) => state.closeToolWindow);
  const [position, setPosition] = useState({ x: 90 + index * 34, y: 80 + index * 28 });
  const [webUrl, setWebUrl] = useState("https://www.openai.com");
  const labels: Record<WorkbenchToolWindow, string> = { whiteboard: "白板", draft: "临时草稿", web: "网页", file: "文件" };
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const start = { clientX: event.clientX, clientY: event.clientY, x: position.x, y: position.y };
    const move = (next: PointerEvent) => setPosition({
      x: Math.max(8, start.x + next.clientX - start.clientX),
      y: Math.max(8, start.y + next.clientY - start.clientY)
    });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <section className="workbench-floating-window" style={{ transform: `translate(${position.x}px, ${position.y}px)`, zIndex: 40 + index }}>
      <header onPointerDown={startDrag}>
        <strong>{labels[tool]}</strong>
        <button type="button" onClick={() => closeToolWindow(tool)}>×</button>
      </header>
      {tool === "whiteboard" ? <div className="workbench-whiteboard" contentEditable suppressContentEditableWarning aria-label="白板编辑区" /> : null}
      {tool === "draft" ? <textarea className="workbench-draft" placeholder="在这里整理临时草稿…" /> : null}
      {tool === "web" ? (
        <div className="workbench-web-window">
          <input value={webUrl} onChange={(event) => setWebUrl(event.target.value)} />
          <iframe src={webUrl} title="工作台网页预览" sandbox="allow-forms allow-scripts allow-same-origin" />
        </div>
      ) : null}
      {tool === "file" ? <SelectedFilePreview /> : null}
    </section>
  );
}

export function WorkbenchShell({ userId, boardId, isMobileMode, onClose }: { userId: string; boardId?: string; isMobileMode: boolean; onClose: () => void }) {
  const loading = useWorkbenchStore((state) => state.loading);
  const error = useWorkbenchStore((state) => state.error);
  const leftPanePercent = useWorkbenchStore((state) => state.leftPanePercent);
  const setLeftPanePercent = useWorkbenchStore((state) => state.setLeftPanePercent);
  const resourceFraction = useWorkbenchStore((state) => state.resourceFraction);
  const generatedFraction = useWorkbenchStore((state) => state.generatedFraction);
  const setStackFractions = useWorkbenchStore((state) => state.setStackFractions);
  const fullscreenPanel = useWorkbenchStore((state) => state.fullscreenPanel);
  const toolWindows = useWorkbenchStore((state) => state.toolWindows);
  const openToolWindow = useWorkbenchStore((state) => state.openToolWindow);
  const delegateTask = useWorkbenchStore((state) => state.delegateTask);
  const [discussionText, setDiscussionText] = useState("");

  const beginColumnResize = (event: ReactPointerEvent) => {
    if (isMobileMode) return;
    const root = event.currentTarget.parentElement;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const move = (next: PointerEvent) => setLeftPanePercent(((next.clientX - rect.left) / rect.width) * 100);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const beginRowResize = (which: "resource" | "generated", event: ReactPointerEvent) => {
    if (isMobileMode) return;
    const stack = event.currentTarget.parentElement;
    if (!stack) return;
    const rect = stack.getBoundingClientRect();
    const move = (next: PointerEvent) => {
      const ratio = Math.min(0.72, Math.max(0.18, (next.clientY - rect.top) / rect.height));
      if (which === "resource") setStackFractions(ratio * 3, generatedFraction);
      else setStackFractions(resourceFraction, Math.max(0.55, ratio * 3 - resourceFraction));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const panelStyle = useMemo(
    () => ({ "--workbench-topic-width": `${leftPanePercent}%` } as CSSProperties),
    [leftPanePercent]
  );

  return (
    <section className={`workbench-root ${isMobileMode ? "workbench-root--mobile" : "workbench-root--desktop"}`} style={panelStyle} aria-label="AI 工作台">
      <header className="workbench-toolbar">
        <div><span className="workbench-live-dot" /><strong>工作台</strong><small>统一 Realtime 会话</small></div>
        <nav>
          <button type="button" onClick={() => openToolWindow("web")}>网页</button>
          <button type="button" onClick={() => openToolWindow("draft")}>草稿</button>
          <button type="button" className="workbench-close-button" onClick={onClose} aria-label="关闭工作台">关闭</button>
        </nav>
      </header>
      {loading ? <div className="workbench-loading">正在加载工作台…</div> : null}
      {error ? <div className="workbench-error">{error}</div> : null}
      <div className={`workbench-layout ${fullscreenPanel ? "has-fullscreen-panel" : ""}`}>
        <TopicPanel userId={userId} boardId={boardId} />
        <div className="workbench-resizer workbench-resizer--column" onPointerDown={beginColumnResize} />
        <div
          className="workbench-right-stack"
          style={{ gridTemplateRows: `minmax(0, ${resourceFraction}fr) 8px minmax(0, ${generatedFraction}fr) 8px minmax(0, 1fr)` }}
        >
          <FilesPanel panel="resources" role="context" userId={userId} />
          <div className="workbench-resizer workbench-resizer--row" onPointerDown={(event) => beginRowResize("resource", event)} />
          <FilesPanel panel="generated" role="generated" userId={userId} />
          <div className="workbench-resizer workbench-resizer--row" onPointerDown={(event) => beginRowResize("generated", event)} />
          <RecordsPanel />
        </div>
      </div>
      <form
        className="workbench-discussion-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const prompt = discussionText.trim();
          if (!prompt) return;
          setDiscussionText("");
          void delegateTask(prompt).catch((reason) => window.alert(reason instanceof Error ? reason.message : "任务创建失败"));
        }}
      >
        <span aria-hidden="true">◉</span>
        <input value={discussionText} onChange={(event) => setDiscussionText(event.target.value)} placeholder="输入问题、分析任务或工具命令" />
        <button type="submit" disabled={!discussionText.trim()}>发送</button>
      </form>
      {toolWindows.map((tool, index) => <FloatingToolWindow key={tool} tool={tool} index={index} />)}
    </section>
  );
}

export function WorkbenchToggle({ open, onToggle, isMobileMode }: { open: boolean; onToggle: () => void; isMobileMode: boolean }) {
  return (
    <button
      type="button"
      className={`workbench-toggle ${isMobileMode ? "workbench-toggle--mobile" : ""} ${open ? "is-open" : ""}`}
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? "关闭工作台" : "打开工作台"}
    >
      <span>⌘</span>{open ? "关闭工作台" : "工作台"}
    </button>
  );
}

export function WorkbenchViewport({
  open,
  userId,
  boardId,
  isMobileMode,
  onClose
}: {
  open: boolean;
  userId: string;
  boardId?: string;
  isMobileMode: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const axis = isMobileMode ? "y" : "x";
  const offset = reduceMotion ? 0 : isMobileMode ? -52 : 72;
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key={isMobileMode ? "mobile-workbench" : "desktop-workbench"}
          className={`workbench-motion-frame workbench-motion-frame--${isMobileMode ? "mobile" : "desktop"}`}
          initial={{ opacity: reduceMotion ? 1 : 0, [axis]: offset }}
          animate={{ opacity: 1, [axis]: 0 }}
          exit={{ opacity: reduceMotion ? 1 : 0, [axis]: offset }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <WorkbenchShell userId={userId} boardId={boardId} isMobileMode={isMobileMode} onClose={onClose} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
