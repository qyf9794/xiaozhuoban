import { useState } from "react";
import { Button } from "@xiaozhuoban/ui";

export function AIGeneratorDialog({
  open,
  onClose,
  onGenerate
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>AI 工具生成器</h2>
        <p style={{ color: "#64748b", marginTop: 0 }}>输入自然语言描述，自动生成结构化表单型 Widget。</p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：给我一个每天记录三件重要事情的小工具"
          style={{ width: "100%", minHeight: 120, borderRadius: 10, border: "1px solid #cbd5e1", padding: 8 }}
        />
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={async () => {
              if (!prompt.trim()) {
                return;
              }
              await onGenerate(prompt.trim());
              setPrompt("");
            }}
          >
            生成
          </Button>
        </div>
      </div>
    </div>
  );
}
