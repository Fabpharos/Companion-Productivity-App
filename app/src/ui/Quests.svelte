<script lang="ts">
  // Today's three quests and this week's one, with progress read from the log.
  import type { QuestState } from "../lib/game.ts";
  import { data } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  const done = $derived(data.game.daily.filter((state) => state.done).length);
</script>

{#snippet row(state: QuestState)}
  <div class="quest" class:is-done={state.done}>
    <span class="mark"><Icon name="check" size={15} /></span>
    <span class="what">{state.quest.text}</span>
    {#if state.quest.target > 1}<span class="tally">{state.have}/{state.quest.target}</span>{/if}
    <span class="points">+{state.quest.bonus}</span>
  </div>
{/snippet}

{#if data.game.daily.length}
  <div class="section-head">
    <h2>Quests</h2>
    <span class="count">{done}/{data.game.daily.length} today</span>
  </div>
  <div class="card">
    {#each data.game.daily as state (state.quest.id)}{@render row(state)}{/each}
  </div>
{/if}
{#if data.game.weekly}
  <div class="section-head"><h2>This week</h2></div>
  <div class="card">{@render row(data.game.weekly)}</div>
{/if}
