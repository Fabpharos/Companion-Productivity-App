<script lang="ts">
  // The companion: its picture in the current pose, and what it is saying.
  // Tapping it gets a line, a suggestion, or a little movement.
  import { poseImage } from "../../content/companion/index.ts";
  import { tapCompanion, ui } from "../state.svelte.ts";

  let { large = false }: { large?: boolean } = $props();
</script>

<div class="companion" class:large>
  <button class="avatar" aria-label="Companion" onclick={tapCompanion}>
    {#key ui.wiggle}
      <img class:wiggle={ui.wiggle > 0} src={poseImage(ui.companion.pose)} alt="" />
    {/key}
  </button>
  {#if ui.companion.text}
    <p class="bubble" aria-live="polite">{ui.companion.text}</p>
  {/if}
</div>
