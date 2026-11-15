<script lang="ts">
  // Chores, most due first, shaded from green (fresh) to red (well overdue).
  import { describeEvery, describeSince, hue, spin, visibleChores } from "../lib/chores.ts";
  import { remainingChorePoints } from "../lib/game.ts";
  import { actions, completeChore, data, startTimer, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";
  import Stats from "../ui/Stats.svelte";

  const lowEnergy = $derived(data.settings.lowEnergy);
  const chores = $derived(visibleChores(data.chores, lowEnergy, data.now));
  const hidden = $derived(data.chores.length - chores.length);

  let pickedId = $state<string | null>(null);
  const picked = $derived(chores.find((chore) => chore.id === pickedId));

  function roll() {
    // Spinning again never lands on the same chore twice in a row when there is another to land on.
    const pool = chores.length > 1 ? chores.filter((chore) => chore.id !== pickedId) : chores;
    pickedId = spin(pool, data.now, Math.random())?.id ?? null;
  }
</script>

<Stats />

{#if data.chores.length}
  <div class="tools">
    <button class="btn" onclick={roll} disabled={!chores.length}><Icon name="dice" size={18} />Pick one for me</button>
    <span class="toggle">
      Low energy
      <button class="switch" role="switch" aria-checked={lowEnergy} aria-label="Low-energy mode" onclick={() => actions.setLowEnergy(!lowEnergy)}></button>
    </span>
  </div>
{/if}

{#if picked}
  <div class="banner plain" role="status">
    <p>How about <strong>{picked.name}</strong>?</p>
    <button
      class="btn small primary"
      onclick={() => {
        startTimer("chore", picked.id, picked.name, 5);
        pickedId = null;
      }}>Just 5 minutes</button
    >
    <button class="btn small" onclick={roll} disabled={chores.length < 2}>Another</button>
  </div>
{/if}

{#if chores.length}
  <div class="card" style="margin-top:12px">
    {#each chores as chore (chore.id)}
      <div class="chore" style:--hue={hue(chore, data.now)}>
        <span class="shade"></span>
        <button class="body" onclick={() => (ui.choreId = chore.id)}>
          <span class="name">{chore.name}</span>
          <span class="since">
            <b>{describeSince(chore, data.now)}</b> · {describeEvery(chore.everyDays)}{chore.steps.length
              ? ` · ${chore.steps.filter((step) => step.done).length}/${chore.steps.length} steps`
              : ""}
          </span>
        </button>
        <span class="side">
          <span class="points">+{remainingChorePoints(chore, data.now)}</span>
          <button class="check" aria-label="Done: {chore.name}" onclick={() => completeChore(chore)}>
            <span><Icon name="check" size={17} /></span>
          </button>
        </span>
      </div>
    {/each}
  </div>
{:else if data.chores.length}
  <p class="empty"><strong>No easy chores</strong>Nothing here is rated easy. Resting is allowed.</p>
{:else}
  <p class="empty">
    <strong>No chores yet</strong>Type one above with how often it comes round, like "Vacuum weekly" or "Change sheets every 2 weeks".
  </p>
{/if}

{#if lowEnergy && hidden}
  <p class="muted small" style="margin:10px 4px 0;text-align:center">
    {hidden} harder {hidden === 1 ? "chore is" : "chores are"} tucked away for now.
  </p>
{/if}
