// Starting request bodies for Test A. Every one is editable on the page.
//
// None of these shapes is confirmed yet; confirming them is the point of the test.
// Sources (read Nov 14, 2026):
//   - V5: field list the NovelAI web client sends, as recorded by novelai-python's tests
//   - V4.5: a request captured from the web client, in NekoAI-API's examples
//   - Text: NekoAI-API's /ai/generate payload

const NEGATIVE =
  "nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, " +
  "very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, " +
  "too many watermarks, negative space, blank page";

const PROMPT = "1girl, solo, smile, upper body, simple background, very aesthetic, masterpiece, no text";

// 512x768 at 23 steps: the smallest standard size, well inside the Opus free band.
const SIZE = { width: 512, height: 768 };

const prompts = {
  v4_prompt: {
    caption: { base_caption: PROMPT, char_captions: [] },
    use_coords: false,
    use_order: true,
  },
  v4_negative_prompt: {
    caption: { base_caption: NEGATIVE, char_captions: [] },
    legacy_uc: false,
  },
  negative_prompt: NEGATIVE,
};

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export function v5Body() {
  return {
    input: PROMPT,
    model: "nai-diffusion-5-full",
    action: "generate",
    parameters: {
      params_version: 4,
      ...SIZE,
      scale: 7,
      sampler: "k_euler_ancestral",
      steps: 23,
      n_samples: 1,
      ucPresetId: "heavy",
      qualityPresetId: "standard",
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
      seed: randomSeed(),
      characterPrompts: [],
      straight_alpha: true,
      tag_hint_qt: 1,
      tag_hint_uc_preset: 2,
      ...prompts,
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
      noise_schedule: "karras",
      image_format: "png",
      skip_cfg_above_sigma: null,
      stream: "msgpack",
    },
  };
}

export function v45Body() {
  return {
    input: PROMPT,
    model: "nai-diffusion-4-5-full",
    action: "generate",
    parameters: {
      params_version: 3,
      ...SIZE,
      scale: 5,
      sampler: "k_euler_ancestral",
      steps: 23,
      n_samples: 1,
      ucPreset: 0,
      qualityToggle: true,
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
      seed: randomSeed(),
      characterPrompts: [],
      ...prompts,
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
      noise_schedule: "karras",
      skip_cfg_above_sigma: null,
      stream: "msgpack",
    },
  };
}

export function textBody() {
  return {
    input:
      "A warm, upbeat companion cheers her friend on with short, kind remarks.\n" +
      "***\n" +
      "Her friend just finished the laundry, the third chore of the day.\n" +
      'The companion beamed. "',
    model: "llama-3-erato-v1",
    parameters: {
      use_string: true,
      max_length: 40,
      min_length: 1,
      temperature: 1,
      top_p: 0.95,
      generate_until_sentence: true,
    },
  };
}
