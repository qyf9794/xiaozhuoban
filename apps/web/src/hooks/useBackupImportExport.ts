import { useRef, type ChangeEvent } from "react";

interface UseBackupImportExportOptions {
  activeBoardName: string;
  createBackupSnapshot: () => Promise<Record<string, unknown>>;
  importBackupSnapshot: (snapshot: unknown, backupName?: string) => Promise<void>;
}

export function useBackupImportExport({
  activeBoardName,
  createBackupSnapshot,
  importBackupSnapshot
}: UseBackupImportExportOptions) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const openBackupImporter = () => backupInputRef.current?.click();

  const exportBackup = () => {
    void (async () => {
      const snapshot = await createBackupSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const safeBoardName = (activeBoardName || "小桌板").replace(/[\\/:*?"<>|]/g, "_").trim();
      anchor.download = `${safeBoardName}-备份-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    })();
  };

  const handleBackupInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const text = await file.text();
        const snapshot = JSON.parse(text) as unknown;
        const confirmed = window.confirm("导入会新建桌板并保留当前数据，是否继续？");
        if (!confirmed) return;
        const backupName = file.name.replace(/\.json$/i, "").trim();
        await importBackupSnapshot(snapshot, backupName);
        window.alert("导入成功");
      } catch (error) {
        const message = error instanceof Error ? error.message : "导入失败";
        window.alert(message);
      } finally {
        event.currentTarget.value = "";
      }
    })();
  };

  return {
    backupInputRef,
    exportBackup,
    handleBackupInputChange,
    openBackupImporter
  };
}
