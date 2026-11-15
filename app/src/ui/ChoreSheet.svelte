<script lang="ts">
  // One chore: do it, time five minutes on it, tick its steps, or change how
  // often it comes round. Changes save as they are made.
  import { describeEvery, describeSince, hue } from "../lib/chores.ts";
  import { remainingChorePoints, stepPoints } from "../lib/game.ts";
  import { newId, type Chore } from "../lib/model.ts";
  import { actions, completeChore, data, removeChore, startTimer, toggleStep, ui } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  let { id }: { id: string } = $props();

  const EVERY = [1, 3, 7, 14, 30];
  const EFFORT = ["Easy", "Medium", "Hard"];
  const DISLIKE = ["Fine", "Dislike", "Hate"];

  const chore = $derived(data.chores.find((other) => other.id === id));
  // svelte-ignore state_referenced_locally
  let name = $state(chore?.name ?? "");
  let newStep = $state("");

  function change(fields: Partial<Chore>) {
    if (chore) void actions.saveChore({ ...chore, ...fields });
  }

  function addStep(event: SubmitEvent) {
    event.preventDefault();
    if (!chore || !newStep.trim()) return;
    change({ steps: [...chore.steps, { id: newId(), text: newStep.trim(), done: false }] });
    newStep = "";
  }

  function close() {
    if (chore && name.trim() && name.trim() !== chore.name) change({ name: name.trim() });
    ui.choreId = null;
  }

  function finish(action: (chore: Chore) => unknown) {
    const current = chore;
    close();
    if (current) void action(current);
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Chore">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={close}><Icon name="back" /></button>
    <h2>Chore</h2>
    <button class="done" onclick={close}>Done</button>
  </div>

  {#if chore}
    <div class="sheet-body">
      <div class="card">
        <div class="chore" style:--hue={hue(chore, data.now)}>
          <span class="shade"></span>
          <div class="body">
            <input
              class="name"
              style="border:0;background:none;outline:0;padding:0;font-size:1.15rem;width:100%"
              type="text"
              bind:value={name}
              onchange={() => name.trim() && change({ name: name.trim() })}
              aria-label="Name"
            />
            <span class="since"><b>{describeSince(chore, data.now)}</b> · {describeEvery(chore.everyDays)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn primary" style="flex:1" onclick={() => finish(completeChore)}>
          <Icon name="check" size={18} />Done<span style="opacity:.8;font-weight:500">+{remainingChorePoints(chore, data.now)}</span>
        </button>
        <button class="btn" style="flex:1" onclick={() => finish((c) => startTimer("chore", c.id, c.name, 5))}>
          <Icon name="timer" size={18} />Just 5 minutes
        </button>
      </div>

      <div class="section-head">
        <h2>Steps</h2>
        {#if chore.steps.length}<span class="count">+{stepPoints(chore, data.now)} each</span>{/if}
      </div>
      <div class="card">
        <div class="steps" style="padding:4px 8px">
          {#each chore.steps as step (step.id)}
            <div class="step" class:is-done={step.done}>
              <button class="check" role="checkbox" aria-checked={step.done} aria-label="Step done" onclick={() => toggleStep(chore, step.id)}>
                <span class="row"><span class="box" class:on={step.done} style="width:22px;height:22px"><Icon name="check" size={14} /></span></span>
              </button>
              <input
                type="text"
                value={step.text}
                aria-label="Step"
                onchange={(event) =>
                  change({ steps: chore.steps.map((other) => (other.id === step.id ? { ...other, text: event.currentTarget.value } : other)) })}
              />
              <button class="side" aria-label="Remove step" onclick={() => change({ steps: chore.steps.filter((other) => other.id !== step.id) })}>
                <Icon name="close" size={16} />
              </button>
            </div>
          {/each}
          <form class="step" onsubmit={addStep}>
            <span class="check"><Icon name="plus" size={18} /></span>
            <input type="text" bind:value={newStep} placeholder="Add a small step" enterkeyhint="done" aria-label="New step" />
          </form>
        </div>
      </div>
      {#if chore.steps.length}
        <p class="muted small" style="margin:8px 4px 0">Ticking the last step completes the chore. Steps clear for next time.</p>
      {/if}

      <div class="section-head"><h2>How often and how hard</h2></div>
      <div class="card">
        <div class="field stack">
          <label class="field" style="padding:0;min-height:0">
            <span class="label">Every</span>
            <input
              type="number"
              inputmode="numeric"
              min="1"
              value={chore.everyDays}
              onchange={(event) => change({ everyDays: Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)) })}
            />
            <span class="muted">{chore.everyDays === 1 ? "day" : "days"}</span>
          </label>
          <div class="chips">
            {#each EVERY as days (days)}
              <button class="chip" aria-pressed={chore.everyDays === days} onclick={() => change({ everyDays: days })}>{describeEvery(days)}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="label">Effort</span>
          <div class="seg grow" role="group" aria-label="Effort">
            {#each EFFORT as label, index (label)}
              <button aria-pressed={chore.effort === index + 1} onclick={() => change({ effort: (index + 1) as Chore["effort"] })}>{label}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="label">Feeling</span>
          <div class="seg grow" role="group" aria-label="How you feel about it">
            {#each DISLIKE as label, index (label)}
              <button aria-pressed={chore.dislike === index} onclick={() => change({ dislike: index as Chore["dislike"] })}>{label}</button>
            {/each}
          </div>
        </div>
      </div>
      <p class="muted small" style="margin:8px 4px 0">Harder, overdue and disliked chores earn more points. Easy chores are the ones shown in low-energy mode.</p>

      <button class="btn danger" style="width:100%;margin-top:24px" onclick={() => finish(removeChore)}><Icon name="trash" size={18} />Delete chore</button>
    </div>
  {:else}
    <p class="empty">This chore no longer exists.</p>
  {/if}
</div>
