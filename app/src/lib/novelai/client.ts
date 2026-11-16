// The calls to NovelAI. All of them are here, and nothing else in the app
// talks to NovelAI or sees the token on its way out. The token goes in the
// Authorization header to NovelAI's own two hosts and nowhere else.

import { finalImage } from "./codec.ts";
import { imageBody, isMultipart, readAccount, textBody, trimReply, type Account, type ImageModel } from "./requests.ts";

const IMAGE_HOST = "https://image.novelai.net";
const TEXT_HOST = "https://text.novelai.net";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class NovelAiError extends Error {
  /** "token" is a refused token, "payment" is not enough Anlas, "busy" is a rate limit, "network" is no connection. */
  kind: "token" | "payment" | "busy" | "network" | "other";
  constructor(kind: NovelAiError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

async function send(fetcher: Fetch, token: string, url: string, init: RequestInit): Promise<Response> {
  if (!token.trim()) throw new NovelAiError("token", "Enter your NovelAI token first.");
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token.trim()}` },
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new NovelAiError("network", "NovelAI could not be reached. Check the connection.");
  }
  if (response.ok) return response;
  const detail = await response
    .json()
    .then((data: { message?: unknown }) => (typeof data.message === "string" ? data.message : ""))
    .catch(() => "");
  if (response.status === 401) throw new NovelAiError("token", "NovelAI did not accept the token. Check it in your NovelAI account settings.");
  if (response.status === 402) throw new NovelAiError("payment", "NovelAI says the account cannot pay for this.");
  if (response.status === 429) throw new NovelAiError("busy", "NovelAI is busy with another request from this account. Try again in a moment.");
  throw new NovelAiError("other", `NovelAI answered ${response.status}${detail ? `: ${detail}` : "."}`);
}

/** The subscription tier and how much is left to spend. */
export async function fetchAccount(token: string, fetcher: Fetch = fetch): Promise<Account> {
  const response = await send(fetcher, token, `${IMAGE_HOST}/user/subscription`, { method: "GET" });
  const account = readAccount(await response.json().catch(() => null));
  if (!account) throw new NovelAiError("other", "NovelAI's account answer was not in a form this app knows.");
  return account;
}

/** Draws one picture. Answers with the picture file's bytes and type. */
export async function generateImage(
  token: string,
  model: ImageModel,
  prompt: string,
  seed: number,
  fetcher: Fetch = fetch,
): Promise<{ bytes: Uint8Array; type: string }> {
  const json = JSON.stringify(imageBody(model, prompt, seed));
  let init: RequestInit;
  if (isMultipart(model)) {
    const form = new FormData();
    form.append("request", new Blob([json], { type: "application/json" }), "blob");
    init = { method: "POST", body: form };
  } else {
    init = { method: "POST", body: json, headers: { "Content-Type": "application/json" } };
  }
  const response = await send(fetcher, token, `${IMAGE_HOST}/ai/generate-image-stream`, init);
  try {
    return finalImage(new Uint8Array(await response.arrayBuffer()));
  } catch (reason) {
    throw new NovelAiError("other", reason instanceof Error ? reason.message : "NovelAI's picture could not be read.");
  }
}

/** Continues a scene with one line of speech. Null when the reply is empty or not usable as a line. */
export async function generateLine(token: string, scene: string, fetcher: Fetch = fetch): Promise<string | null> {
  const response = await send(fetcher, token, `${TEXT_HOST}/ai/generate`, {
    method: "POST",
    body: JSON.stringify(textBody(scene)),
    headers: { "Content-Type": "application/json" },
  });
  const data = (await response.json().catch(() => null)) as { output?: unknown } | null;
  return trimReply(data?.output);
}
