<script lang="ts">
  // The running timer, shown above the tabs on every screen. When a chore's
  // timer ends, stopping there counts as doing the chore.
  import { complete, completeChore, data, stopTimer, ui } from "../state.svelte.ts";

  const left = $derived(ui.timer ? Math.max(0, Math.ceil((ui.timer.endsAt - ui.clock) / 1000)) : 0);
  const text = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);

  function count() {
    const timer = ui.timer;
    if (!timer) return;
    if (timer.kind === "chore") {
      const chore = data.chores.find((other) => other.id === timer.id);
      if (chore) void completeChore(chore);
    } else {
      const item = data.items.find((other) => other.id === timer.id);
      if (item) void complete(item);
    }
    stopTimer();
  }
</script>

{#if ui.timer}
  <div class="timer" role="timer" aria-label="Timer for {ui.timer.name}">
    {#if left > 0}
      <span class="what">{ui.timer.name}</span>
      <span class="left">{text}</span>
      <button onclick={stopTimer}>Stop</button>
    {:else}
      <span class="what">Time's up · {ui.timer.name}</span>
      <button onclick={count}>{ui.timer.kind === "chore" ? "Count it" : "Complete"}</button>
      <button onclick={stopTimer}>{ui.timer.kind === "chore" ? "Keep going" : "Close"}</button>
    {/if}
  </div>
{/if}
