// Web Push for Cloudflare Workers, on WebCrypto only (no Node APIs, no dependencies).
//
//   - Message encryption: RFC 8291 (aes128gcm content coding from RFC 8188)
//   - Server identification: VAPID, RFC 8292
//
// Kept free of Worker-specific types so the same file runs under `node --test`.

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url (65 bytes). This is the applicationServerKey. */
  publicKey: string;
  /** P-256 private scalar, base64url (32 bytes). */
  privateKey: string;
  /** Contact for the push service: a `mailto:` or `https:` URL. Apple rejects anything else. */
  subject: string;
}

export interface PushOptions {
  /** Seconds the push service keeps the message if the phone is offline. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

/** Bytes backed by a plain ArrayBuffer, which is what WebCrypto and fetch accept. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export function b64urlEncode(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Bytes {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** JWK for a P-256 private key given the raw scalar and the uncompressed public point. */
function privateJwk(publicKey: Bytes, privateKey: Bytes): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error("Public key must be a 65-byte uncompressed P-256 point");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(publicKey.subarray(1, 33)),
    y: b64urlEncode(publicKey.subarray(33, 65)),
    d: b64urlEncode(privateKey),
  };
}

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface EncryptOverrides {
  /** Fixed salt and sender key pair. For known-answer tests only. */
  salt?: Bytes;
  senderPublicKey?: Bytes;
  senderPrivateKey?: Bytes;
}

/** Encrypts `plaintext` for one subscription. Returns the full aes128gcm request body. */
export async function encryptPayload(
  plaintext: Bytes,
  subscription: PushSubscription,
  overrides: EncryptOverrides = {},
): Promise<Bytes> {
  const receiverPublic = b64urlDecode(subscription.keys.p256dh);
  const authSecret = b64urlDecode(subscription.keys.auth);

  let senderPublic: Bytes;
  let senderPrivate: CryptoKey;
  if (overrides.senderPublicKey && overrides.senderPrivateKey) {
    senderPublic = overrides.senderPublicKey;
    senderPrivate = await crypto.subtle.importKey(
      "jwk",
      privateJwk(overrides.senderPublicKey, overrides.senderPrivateKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const pair = (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    )) as CryptoKeyPair;
    senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer);
    senderPrivate = pair.privateKey;
  }

  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderPrivate, 256),
  );

  // RFC 8291 section 3.4: mix the subscription's auth secret into the shared secret.
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(encoder.encode("WebPush: info\0"), receiverPublic, senderPublic),
    32,
  );

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // One record holds the whole message; 0x02 marks it as the last record.
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  // RFC 8188 header: salt (16) | record size (4) | key id length (1) | key id (sender public key).
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([senderPublic.length]), senderPublic, ciphertext);
}

/** Builds the `Authorization` header value identifying this server to a push service. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  now: number = Date.now(),
): Promise<string> {
  if (!/^(mailto:|https:\/\/)\S+$/.test(vapid.subject)) {
    throw new Error("VAPID subject must be a mailto: or https:// URL");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk(b64urlDecode(vapid.publicKey), b64urlDecode(vapid.privateKey)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** True when the push service says the subscription no longer exists (404 or 410). */
  gone: boolean;
  detail: string;
}

/** Encrypts `payload` as JSON and delivers it to the subscription's push service. */
export async function sendPush(
  subscription: PushSubscription,
  payload: unknown,
  vapid: VapidKeys,
  options: PushOptions = {},
): Promise<PushResult> {
  const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), subscription);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttl ?? 24 * 60 * 60),
      Urgency: options.urgency ?? "normal",
    },
    body,
  });
  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
    detail: response.ok ? "" : (await response.text()).slice(0, 500),
  };
}

/** Creates a VAPID key pair in the format the Worker's secrets expect. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer);
  return { publicKey: b64urlEncode(publicKey), privateKey: jwk.d as string };
}
