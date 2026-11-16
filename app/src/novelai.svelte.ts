// NovelAI in the running app: drawing a look, holding it for approval,
// keeping watch on what it costs, and offering generated lines.
//
// Nothing here is needed for the app to work. With NovelAI off, offline, or
// failing, the companion shows the nearest picture it has and says its
// pre-set lines.

import type { LineEvent } from "../content/dialogue.ts";
import { keepDrawn } from "./image.ts";
import type { Vars } from "./lib/companion.ts";
import { removeImages, saveImage, saveNovelAi } from "./lib/db.ts";
import type { NovelAi, PoseName, StoredImage } from "./lib/model.ts";
import { fetchAccount, generateImage, generateLine, NovelAiError } from "./lib/novelai/client.ts";
import { buildPrompt, buildScene, chooseModel, GENERATED_EVENTS, isFree, V45, V5, type Account, type ImageModel } from "./lib/novelai/requests.ts";
import { defaultLook, imageId, isGenerated, type Look } from "./lib/outfits.ts";
import { data, onSpeak, remembered, replaceLine, saveCard, toast, ui } from "./state.svelte.ts";

/** A picture that has been drawn and is waiting to be kept or thrown away. */
export interface Candidate extends StoredImage {
  look: Look;
  pose: PoseName;
  seed: number;
  model: ImageModel;
}

/** A drawing that would spend Anlas, waiting for a yes. */
export interface Ask {
  look: Look;
  pose: PoseName;
  anlas: number;
}

class Nai {
  account = $state.raw<Account | null>(null);
  busy = $state(false);
  error = $state("");
  candidate = $state.raw<Candidate | null>(null);
  ask = $state.raw<Ask | null>(null);
}

export const nai = new Nai();

export function setNovelAi(patch: Partial<NovelAi>) {
  data.nai = { ...data.nai, ...patch };
  void saveNovelAi(patch);
}

const message = (reason: unknown) => (reason instanceof NovelAiError ? reason.message : reason instanceof Error ? reason.message : "Something went wrong.");

/** True when the card has what NovelAI needs to draw from. */
export function cardReady(): boolean {
  return data.card.name.trim() !== "" && data.card.basePrompt.trim() !== "";
}

/** Reads the account: its tier and what is left to spend. */
export async function checkAccount(): Promise<void> {
  nai.busy = true;
  nai.error = "";
  try {
    nai.account = await fetchAccount(data.nai.token);
  } catch (reason) {
    nai.account = null;
    nai.error = message(reason);
  } finally {
    nai.busy = false;
  }
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
/** Looks thrown away this session, so they are not drawn again unasked. */
const declined = new Set<string>();

/**
 * Draws one look and holds the picture for approval.
 *   manual: asked for by a tap. A drawing nobody asked for never spends Anlas.
 *   paid:   the user has said yes to spending Anlas on this one.
 *   fresh:  a new seed, for "try again".
 */
export async function draw(look: Look, pose: PoseName, options: { manual: boolean; paid?: boolean; fresh?: boolean }): Promise<void> {
  if (nai.busy) return;
  const { card } = data;
  const token = data.nai.token;
  if (!cardReady()) {
    if (options.manual) nai.error = "Give the companion a name and a base prompt first.";
    return;
  }
  nai.busy = true;
  // Only a drawing that was asked for reports on itself. One made unasked fails quietly,
  // since the nearest picture is already on screen, and leaves any message alone.
  if (options.manual) nai.error = "";
  nai.ask = null;
  try {
    const account = await fetchAccount(token);
    nai.account = account;
    const choice = chooseModel(account);
    if (!choice.free && !options.paid) {
      // Never spent without a yes. An automatic drawing just stops here.
      if (options.manual) nai.ask = { look, pose, anlas: account.anlas };
      return;
    }
    const seed = options.fresh || card.seed === null ? randomSeed() : card.seed;
    let model = choice.model;
    let picture: { bytes: Uint8Array; type: string };
    try {
      picture = await generateImage(token, model, buildPrompt(card, look.tags, pose, model), seed);
    } catch (reason) {
      // V5 is new and its request format may change. V4.5 is tried in its place, but only where that costs nothing more.
      const canFallBack = model === V5 && reason instanceof NovelAiError && reason.kind === "other" && (options.paid || isFree(account, V45));
      if (!canFallBack) throw reason;
      model = V45;
      picture = await generateImage(token, model, buildPrompt(card, look.tags, pose, model), seed);
    }
    nai.candidate = { id: imageId(look.key, pose), ...(await keepDrawn(picture.bytes, picture.type)), look, pose, seed, model };
    if (options.paid) {
      const after = await fetchAccount(token).catch(() => null);
      if (after) {
        nai.account = after;
        toast(`Spent ${Math.max(0, account.anlas - after.anlas)} Anlas`);
      }
    }
  } catch (reason) {
    if (options.manual) nai.error = message(reason);
  } finally {
    nai.busy = false;
  }
}

/** Keeps the picture waiting for approval. The first approved everyday picture fixes the character's seed. */
export async function approve(): Promise<void> {
  const candidate = nai.candidate;
  if (!candidate) return;
  const { look: _look, pose, seed, model: _model, ...image } = candidate;
  await saveImage(image);
  if (pose === "idle" && candidate.id === imageId(defaultLook(data.card).key, "idle")) saveCard({ seed });
  nai.candidate = null;
}

export function discard() {
  if (nai.candidate) declined.add(nai.candidate.id);
  nai.candidate = null;
  nai.ask = null;
}

/** Removes every picture NovelAI drew. Uploaded pictures stay. */
export async function clearDrawn(): Promise<void> {
  await removeImages((id) => isGenerated({ id, data: "", width: 0, height: 0 }));
  nai.candidate = null;
}

/** The pose and look on screen now have no picture of their own yet. */
export function missingNow(): boolean {
  return data.drawn && !data.images.some((image) => image.id === imageId(data.look.key, ui.companion.pose));
}

/**
 * Draws the look on screen if it has no picture yet, without being asked:
 * only online, only when it costs nothing, only a few times a day, and never
 * a look that was thrown away this session.
 */
export async function autoDraw(): Promise<void> {
  const settings = data.nai;
  if (!settings.images || !settings.auto || !settings.token || !data.drawn || !navigator.onLine) return;
  if (nai.busy || nai.candidate || nai.ask || !missingNow()) return;
  const id = imageId(data.look.key, ui.companion.pose);
  if (declined.has(id)) return;
  const count = remembered.get<{ date: string; count: number }>("drawnToday");
  const used = count?.date === data.today ? count.count : 0;
  if (used >= settings.dailyCap) return;
  await draw(data.look, ui.companion.pose, { manual: false });
  if (!nai.candidate) return;
  // Only a picture that was actually drawn counts against the day's allowance.
  remembered.set("drawnToday", { date: data.today, count: used + 1 });
  toast("A new look is ready on the Companion tab");
}

// ---------- Generated lines ----------

const WAIT_BEFORE_ASKING = 1200;
const TOO_LATE = 8000;
let lineTimer: ReturnType<typeof setTimeout> | undefined;
let serial = 0;

/**
 * Asks NovelAI for a line to stand in for the pre-set one just said. The
 * pre-set line is already on screen and stays if the reply is slow, empty,
 * off-format or fails. Completions in quick succession get one line between
 * them: each new one restarts the wait.
 */
function react(event: LineEvent, vars: Vars) {
  clearTimeout(lineTimer);
  const { token, text } = data.nai;
  if (!text || !token || !navigator.onLine || !GENERATED_EVENTS.includes(event)) return;
  const scene = buildScene(data.card, event, vars);
  if (!scene) return;
  const shown = ui.companion;
  const mine = ++serial;
  lineTimer = setTimeout(async () => {
    const asked = Date.now();
    const line = await generateLine(token, scene).catch(() => null);
    if (!line || mine !== serial || ui.companion !== shown || Date.now() - asked > TOO_LATE) return;
    // The points earned are a fact, not something to leave to the model.
    const earned = typeof vars.points === "number" && vars.points > 0 ? ` +${vars.points}${event === "quest" ? " bonus" : ""}.` : "";
    replaceLine(line + earned);
  }, WAIT_BEFORE_ASKING);
}

onSpeak(react);
