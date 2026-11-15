<script lang="ts">
  // The companion: its picture in the current pose, and what it is saying.
  // Tapping it gets a line, a suggestion, or a little movement.
  //
  // Companion art is a tall portrait of the whole character. `whole` shows
  // all of it, for the Companion tab. Otherwise a close-up of the face is
  // cropped from the same image, to sit beside the speech bubble.
  import { CLOSE_UP_ASPECT, crop, PORTRAIT_ASPECT } from "../lib/portrait.ts";
  import { companionArt, tapCompanion, ui } from "../state.svelte.ts";

  let { whole = false }: { whole?: boolean } = $props();

  const art = $derived(companionArt());
  const src = $derived(art.image(ui.companion.pose));

  // The image's real shape, known once it has loaded. Art of any shape is framed correctly, not just 2:3.
  let loaded = $state<{ src: string; aspect: number } | null>(null);
  const aspect = $derived(loaded?.src === src ? loaded.aspect : PORTRAIT_ASPECT);
  const box = $derived(crop(art.framing, aspect, CLOSE_UP_ASPECT));

  function measure(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image.naturalWidth && image.naturalHeight) loaded = { src, aspect: image.naturalWidth / image.naturalHeight };
  }
</script>

<div class="companion" class:whole>
  {#key ui.wiggle}
    <button
      class="portrait"
      class:wiggle={ui.wiggle > 0}
      style:aspect-ratio={whole ? aspect : CLOSE_UP_ASPECT}
      aria-label="Companion"
      onclick={tapCompanion}
    >
      {#if whole}
        <img {src} alt="" onload={measure} />
      {:else}
        <img {src} alt="" onload={measure} style:width="{box.width}%" style:left="{box.left}%" style:top="{box.top}%" />
      {/if}
    </button>
  {/key}
  {#if ui.companion.text}
    <p class="bubble" aria-live="polite">{ui.companion.text}</p>
  {/if}
</div>
