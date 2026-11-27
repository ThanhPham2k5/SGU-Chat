import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

export type KeyPair = {
  /** Khóa riêng 32 byte, base64. Chỉ lưu trong kho bảo mật của thiết bị. */
  privateKey: string;
  /** Khóa công khai dạng SPKI DER, base64. Gửi lên máy chủ khi ghép. */
  publicKeySpki: string;
};

// Tiền tố SPKI DER cho khóa công khai P-256 không nén (65 byte).
const SPKI_P256_PREFIX = hexToBytes('3059301306072a8648ce3d020106082a8648ce3d030107034200');

export function generateKeyPair(): KeyPair {
  const priv = p256.utils.randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  return {
    privateKey: base64.encode(priv),
    publicKeySpki: base64.encode(concatBytes(SPKI_P256_PREFIX, pub)),
  };
}

/** Ký SHA256withECDSA, trả về chữ ký DER base64. Máy chủ kiểm tra bằng Java Signature. */
export function signMessage(privateKeyB64: string, message: string): string {
  const priv = base64.decode(privateKeyB64);
  const digest = sha256(utf8ToBytes(message));
  const signature = p256.sign(digest, priv);
  return base64.encode(signature.toDERRawBytes());
}
