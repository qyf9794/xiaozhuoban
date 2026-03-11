export const ONLINE_USERS_CHANNEL = "online-users";
export const MESSAGE_BOARD_CHANNEL = "message-board";

export interface MessageBoardItem {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export function resolveUserName(payload: {
  email?: string | null;
  userMetadata?: Record<string, unknown> | null;
}): string {
  const metadata = payload.userMetadata ?? null;
  const fromMeta =
    (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata?.name === "string" && metadata.name.trim()) ||
    (typeof metadata?.nickname === "string" && metadata.nickname.trim()) ||
    "";
  if (fromMeta) return fromMeta;
  const email = (payload.email ?? "").trim();
  if (!email) return "匿名用户";
  return email.split("@")[0] || email;
}

export function normalizeMessageList(items: MessageBoardItem[]): MessageBoardItem[] {
  const deduped = new Map<string, MessageBoardItem>();
  items.forEach((item) => {
    if (!item.id || !item.text.trim()) return;
    deduped.set(item.id, item);
  });
  const ordered = [...deduped.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ordered.slice(0, 50);
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function colorForUser(userKey: string): string {
  if (!userKey) return "#334155";
  const hash = hashString(userKey);
  const hue = hash % 360;
  return `hsl(${hue} 68% 36%)`;
}
