// Prints fresh secrets for the Worker. Nothing is written to disk.
// Run with `npm run vapid-keys`, then store each value with `npx wrangler secret put`.

import { b64urlEncode, generateVapidKeys } from "../src/webpush.ts";

const vapid = await generateVapidKeys();
const appKey = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));

console.log(`VAPID_PUBLIC_KEY   ${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY  ${vapid.privateKey}`);
console.log(`APP_KEY            ${appKey}`);
