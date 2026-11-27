import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/sha1';
import { base32nopad } from '@scure/base';

// TOTP theo RFC 6238: HMAC-SHA1, 6 chữ số, mỗi 30 giây. Khớp với cấu hình của máy chủ.
const PERIOD_SECONDS = 30;

export function totpCode(secretBase32: string, nowMs: number = Date.now()): string {
  const key = base32nopad.decode(secretBase32.replace(/[\s=-]/g, '').toUpperCase());
  const counter = Math.floor(nowMs / 1000 / PERIOD_SECONDS);

  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  const digest = hmac(sha1, key, message);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

export function secondsLeft(nowMs: number = Date.now()): number {
  return PERIOD_SECONDS - (Math.floor(nowMs / 1000) % PERIOD_SECONDS);
}
