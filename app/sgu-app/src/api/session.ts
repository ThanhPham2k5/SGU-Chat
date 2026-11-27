import { getAccessToken } from "../storage/tokens";

function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Lấy id người dùng hiện tại từ claim "user-id" của access token. */
export async function getMyUserId(): Promise<number | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const id = decodeClaims(token)?.["user-id"];
  return typeof id === "number" ? id : null;
}