import assert from "node:assert/strict";
import { test } from "node:test";
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  generateVapidKeys,
  vapidAuthorization,
} from "../src/webpush.ts";

// Known-answer test from RFC 8291, Appendix A.
const rfc = {
  plaintext: "When I grow up, I want to be a watermelon",
  senderPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  receiverPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  receiverPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

test("encryptPayload reproduces the RFC 8291 example", async () => {
  const body = await encryptPayload(
    new TextEncoder().encode(rfc.plaintext),
    { endpoint: "https://push.example.net/push/abc", keys: { p256dh: rfc.receiverPublic, auth: rfc.auth } },
    {
      salt: b64urlDecode(rfc.salt),
      senderPublicKey: b64urlDecode(rfc.senderPublic),
      senderPrivateKey: b64urlDecode(rfc.senderPrivate),
    },
  );
  assert.equal(b64urlEncode(body), rfc.body);
});

/** Decrypts an aes128gcm body the way a browser's push service client does. */
async function decrypt(body: Uint8Array, receiver: CryptoKeyPair, auth: Uint8Array): Promise<string> {
  const salt = body.subarray(0, 16);
  const keyLength = body[20]!;
  const senderPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", receiver.publicKey) as ArrayBuffer);

  const senderKey = await crypto.subtle.importKey("raw", senderPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, receiver.privateKey, 256);
  const derive = async (saltBytes: Uint8Array, ikm: BufferSource, info: Uint8Array, length: number) => {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: saltBytes, info }, key, length * 8);
  };
  const text = (value: string) => new TextEncoder().encode(value);
  const info = new Uint8Array([...text("WebPush: info\0"), ...receiverPublic, ...senderPublic]);
  const ikm = await derive(auth, shared, info, 32);
  const contentKey = await derive(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await derive(salt, ikm, text("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ciphertext));
  assert.equal(record.at(-1), 2, "last-record delimiter");
  return new TextDecoder().decode(record.subarray(0, -1));
}

test("a freshly encrypted payload decrypts with the subscription's keys", async () => {
  const receiver = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", receiver.publicKey) as ArrayBuffer);
  const message = JSON.stringify({ title: "Companion", body: "Laundry is ready 🧺" });

  const body = await encryptPayload(new TextEncoder().encode(message), {
    endpoint: "https://web.push.apple.com/abc",
    keys: { p256dh: b64urlEncode(receiverPublic), auth: b64urlEncode(auth) },
  });

  assert.equal(await decrypt(body, receiver, auth), message);
});

test("vapidAuthorization signs a token the public key verifies", async () => {
  const keys = await generateVapidKeys();
  const now = Date.UTC(2026, 10, 14);
  const header = await vapidAuthorization(
    "https://web.push.apple.com/some/long/path",
    { ...keys, subject: "mailto:owner@example.com" },
    now,
  );

  const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(match, "header shape");
  const [, head, claims, signature, publicKey] = match;
  assert.equal(publicKey, keys.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(head!))), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(claims!))), {
    aud: "https://web.push.apple.com",
    exp: now / 1000 + 12 * 60 * 60,
    sub: "mailto:owner@example.com",
  });

  const verifyKey = await crypto.subtle.importKey("raw", b64urlDecode(publicKey!), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifyKey,
    b64urlDecode(signature!),
    new TextEncoder().encode(`${head}.${claims}`),
  );
  assert.equal(valid, true);
});

test("vapidAuthorization rejects a subject Apple would refuse", async () => {
  const keys = await generateVapidKeys();
  await assert.rejects(
    vapidAuthorization("https://web.push.apple.com/x", { ...keys, subject: "owner@example.com" }),
    /mailto: or https:/,
  );
});
