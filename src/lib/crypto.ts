import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

// 비밀값(현재는 settings.llm_api_key) 대칭 암호화. AES-256-GCM.
// 키: 전용 env APP_ENCRYPTION_KEY(base64 32B) 우선 → 없으면 SESSION_SECRET에서 HKDF 파생.
// 저장 형식: "enc:v1:" + base64(iv(12) | tag(16) | ciphertext)

const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = process.env.APP_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const buf = Buffer.from(explicit, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "APP_ENCRYPTION_KEY 는 base64 인코딩된 32바이트여야 합니다 (openssl rand -base64 32).",
      );
    }
    cachedKey = buf;
    return cachedKey;
  }

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    throw new Error(
      "암호화 키가 없습니다. APP_ENCRYPTION_KEY 또는 SESSION_SECRET 를 설정하세요.",
    );
  }
  // SESSION_SECRET → 32바이트 키 파생(고정 salt/info — 결정적).
  const derived = hkdfSync(
    "sha256",
    Buffer.from(sessionSecret, "utf8"),
    Buffer.from("haru-secret-salt", "utf8"),
    Buffer.from("haru-llm-key", "utf8"),
    32,
  );
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/** 평문 → "enc:v1:..." 암호문. 빈 값/null은 그대로 통과(암호화하지 않음). */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return plain ?? null;
  if (isEncrypted(plain)) return plain; // 이미 암호화됨 — 멱등
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** "enc:v1:..." → 평문. 접두사 없으면 레거시 평문으로 보고 그대로 반환. */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored; // 레거시 평문 호환
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
