// What is sent to NovelAI and how its answers are read. Pure functions: the
// calls themselves are in client.ts.
//
// NovelAI has no official API for other apps, and it changes without notice.
// The request bodies here are the ones Phase 0 sent from this phone and got
// pictures and text back for (docs/phase-0-results.md). When NovelAI changes
// something, this file is where it gets fixed.

import type { LineEvent } from "../../../content/dialogue.ts";
import type { Vars } from "../companion.ts";
import type { CompanionCard, PoseName } from "../model.ts";

export const V5 = "nai-diffusion-5-full";
export const V45 = "nai-diffusion-4-5-full";
export type ImageModel = typeof V5 | typeof V45;
export const TEXT_MODEL = "llama-3-erato-v1";

/** The smallest standard portrait size, well inside what an Opus subscription draws for free. */
export const SIZE = { width: 512, height: 768 };
const STEPS = 23;

const NEGATIVE =
  "nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, " +
  "very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, " +
  "too many watermarks, negative space, blank page, text, cropped, out of frame";

/** What each pose adds to the prompt. */
export const MOOD_TAGS: Record<PoseName, string> = {
  idle: "light smile, looking at viewer",
  happy: "happy, smile, open mouth, looking at viewer",
  proud: "proud, smug, hands on own hips, looking at viewer",
  sleepy: "sleepy, half-closed eyes, yawning",
  concerned: "worried, concerned, looking at viewer",
};

/**
 * How every picture is framed, so the art contract holds: the whole character,
 * standing, with nothing behind it. V5 can draw a truly transparent background
 * when asked for one by tag. V4.5 cannot, and gets a plain white backdrop.
 */
const FRAMING_TAGS = "solo, full body, standing";
const BACKDROP_TAGS: Record<ImageModel, string> = {
  [V5]: "transparent background",
  [V45]: "simple background, white background",
};

/** True for a model that can draw a transparent background. */
export function drawsTransparent(model: ImageModel): boolean {
  return model === V5;
}

const clean = (tags: string) =>
  tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(", ");

/** The prompt for one picture on one model: who the character is, what it wears, its mood, the framing and the backdrop. */
export function buildPrompt(card: CompanionCard, outfitTags: string, pose: PoseName, model: ImageModel): string {
  return [card.basePrompt, outfitTags, MOOD_TAGS[pose], FRAMING_TAGS, BACKDROP_TAGS[model]].map(clean).filter(Boolean).join(", ");
}

/** The request body for one picture. */
export function imageBody(model: ImageModel, prompt: string, seed: number): object {
  const prompts = {
    v4_prompt: { caption: { base_caption: prompt, char_captions: [] }, use_coords: false, use_order: true },
    v4_negative_prompt: { caption: { base_caption: NEGATIVE, char_captions: [] }, legacy_uc: false },
    negative_prompt: NEGATIVE,
  };
  const shared = {
    ...SIZE,
    sampler: "k_euler_ancestral",
    steps: STEPS,
    n_samples: 1,
    autoSmea: false,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    cfg_rescale: 0,
    legacy_v3_extend: false,
    use_coords: false,
    legacy_uc: false,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    seed,
    characterPrompts: [],
  };
  const tail = { deliberate_euler_ancestral_bug: false, prefer_brownian: true, noise_schedule: "karras", skip_cfg_above_sigma: null, stream: "msgpack" };
  const parameters =
    model === V5
      ? {
          params_version: 4,
          ...shared,
          scale: 7,
          ucPresetId: "heavy",
          qualityPresetId: "standard",
          // Transparency, as NovelAI's own page asks for it: these two switches, and the
          // "transparent background" tag in the prompt. The switches alone do nothing.
          straight_alpha: true,
          tag_hint_transparent_background: true,
          tag_hint_qt: 1,
          tag_hint_uc_preset: 2,
          ...prompts,
          ...tail,
          image_format: "png",
        }
      : { params_version: 3, ...shared, scale: 5, ucPreset: 0, qualityToggle: true, ...prompts, ...tail };
  return { input: prompt, model, action: "generate", parameters };
}

/** V5 takes its request as a form with the JSON in a part named "request". V4.5 takes plain JSON. */
export function isMultipart(model: ImageModel): boolean {
  return model === V5;
}

// ---------- The account ----------

export interface Account {
  /** 3 is Opus, the tier that draws small pictures for free. */
  tier: number;
  active: boolean;
  anlas: number;
  /** The V5 usage bar, where the account has one. */
  usage: { percent: number; isNegative: boolean } | null;
}

/** Reads the answer of /user/subscription. Null when it is not one. */
export function readAccount(raw: unknown): Account | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.tier !== "number") return null;
  const steps = data.trainingStepsLeft;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const anlas =
    typeof steps === "number"
      ? steps
      : typeof steps === "object" && steps !== null
        ? number((steps as Record<string, unknown>).fixedTrainingStepsLeft) + number((steps as Record<string, unknown>).purchasedTrainingSteps)
        : 0;
  const usage = typeof data.usage === "object" && data.usage !== null ? (data.usage as Record<string, unknown>) : null;
  return {
    tier: data.tier,
    active: data.active !== false,
    anlas,
    usage: usage && typeof usage.percent === "number" ? { percent: usage.percent, isNegative: usage.isNegative === true } : null,
  };
}

const OPUS = 3;

/**
 * Whether one picture at this app's size costs nothing on a model. Opus draws
 * small V4.5 pictures for free. V5 draws on a usage allowance, and is free
 * only while the account reports some of it left. Anything this cannot be
 * sure of counts as not free.
 */
export function isFree(account: Account, model: ImageModel): boolean {
  if (!account.active || account.tier < OPUS) return false;
  if (model === V45) return true;
  return account.usage !== null && !account.usage.isNegative && account.usage.percent > 0;
}

export interface Choice {
  model: ImageModel;
  free: boolean;
}

/** Which model to draw with: V5 when it is free, else V4.5 when that is free, else V5 at a cost. */
export function chooseModel(account: Account): Choice {
  if (isFree(account, V5)) return { model: V5, free: true };
  if (isFree(account, V45)) return { model: V45, free: true };
  return { model: V5, free: false };
}

// ---------- Text ----------

/** The request body for one line of speech. */
export function textBody(scene: string): object {
  return {
    input: scene,
    model: TEXT_MODEL,
    parameters: { use_string: true, max_length: 40, min_length: 1, temperature: 1, top_p: 0.95, generate_until_sentence: true },
  };
}

/** The events a generated line can stand in for. Everything else keeps its pre-set line. */
export const GENERATED_EVENTS: readonly LineEvent[] = ["morning", "day", "evening", "night", "done", "choreDone", "lowDone", "quest", "streak", "levelUp", "bond", "tap"];

/** What just happened, as one sentence of the scene. Null for an event that gets no generated line. */
function situation(event: LineEvent, vars: Vars, who: string): string | null {
  switch (event) {
    case "morning":
      return `It is morning, and ${who}'s friend has just come to say hello.`;
    case "day":
      return `It is the middle of the day, and ${who}'s friend has just come to say hello.`;
    case "evening":
      return `It is evening, and ${who}'s friend has just come to say hello.`;
    case "night":
      return `It is late at night, and ${who}'s friend is still up.`;
    case "done":
    case "lowDone":
      return vars.name ? `${who}'s friend has just finished a task: "${vars.name}".` : `${who}'s friend has just finished a task.`;
    case "choreDone":
      return `${who}'s friend has just finished a chore: "${vars.name}".`;
    case "quest":
      return `${who}'s friend has just completed a quest: ${vars.name}.`;
    case "streak":
      return `${who}'s friend has now got things done ${vars.n} days in a row.`;
    case "levelUp":
      return `${who}'s friend has just reached level ${vars.n}.`;
    case "bond":
      return `${who} and their friend have grown closer.`;
    case "tap":
      return `${who}'s friend gives ${who} a friendly poke.`;
    default:
      return null;
  }
}

/**
 * The start of a short scene for the text model to continue: who the
 * character is, how they talk, what just happened, and an open quotation
 * mark. Null for an event that gets no generated line.
 */
export function buildScene(card: CompanionCard, event: LineEvent, vars: Vars): string | null {
  const who = card.name.trim() || "The companion";
  const what = situation(event, vars, who);
  if (!what) return null;
  const about = [card.description.trim(), card.personality.trim() ? `Personality: ${card.personality.trim()}.` : ""].filter(Boolean).join(" ");
  const examples = card.examples
    .replaceAll("{{char}}", who)
    .replaceAll("{{user}}", "Friend")
    .replace(/<START>/gi, "")
    .trim();
  return [
    `${who} keeps a friend company through their day and cheers them on with short, kind remarks. ${who} never scolds.`,
    about,
    examples,
    "***",
    `${what}\n${who} said, "`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Words no line may contain, generated or pre-set: the companion never scolds or counts what was missed. */
export const SCOLDING = /\b(should have|shouldn't|lazy|failed|failure|behind|neglect|finally|missed|forgot|again\?|disappoint|guilt|shame|overdue)\b/i;

/**
 * The line of speech in the model's reply, or null when it is not usable. The
 * model does not stop at the end of the line (it runs on into a new scene), so
 * the reply is cut at the first closing quotation mark or line break.
 */
export function trimReply(output: unknown): string | null {
  if (typeof output !== "string") return null;
  const line = output.split(/["”\n]/, 1)[0]!.replace(/\s+/g, " ").trim();
  if (line.length < 2 || line.length > 160) return null;
  if (/[*{}<>[\]]|\bhttps?:/.test(line) || SCOLDING.test(line)) return null;
  // Cut off mid-sentence, the line reads as broken. It has to end like speech does.
  return /[.!?…~]$/.test(line) ? line : null;
}
