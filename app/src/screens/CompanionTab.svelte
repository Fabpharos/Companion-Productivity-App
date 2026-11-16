<script lang="ts">
  // The companion up close, the bond with it, the quests, the wish-list of
  // rewards that points can buy, and a look back at recent weeks.
  import { unlockedLines } from "../lib/companion.ts";
  import { describeDue, localDate } from "../lib/dates.ts";
  import { waitingLongest, weeklyCounts } from "../lib/stats.ts";
  import { actions, buyReward, checkIn, data, MILESTONE_EVENTS, toast, ui, type Mood } from "../state.svelte.ts";
  import Companion from "../ui/Companion.svelte";
  import Icon from "../ui/Icon.svelte";
  import Quests from "../ui/Quests.svelte";
  import Stats from "../ui/Stats.svelte";

  const bond = $derived(data.game.bond);
  const lines = $derived(unlockedLines(data.style, bond.level));
  const weeks = $derived(weeklyCounts(data.activity, data.today));
  const most = $derived(Math.max(1, ...weeks.map((week) => week.count)));
  const waiting = $derived(data.travelling ? [] : waitingLongest(data.chores, data.now));
  const milestones = $derived(ui.said.filter((said) => MILESTONE_EVENTS.includes(said.event)).slice(0, 5));
  const said = $derived(ui.said.slice(0, 8));

  const MOODS: { mood: Mood; label: string }[] = [
    { mood: "good", label: "Good" },
    { mood: "okay", label: "Okay" },
    { mood: "low", label: "Low energy" },
  ];

  let name = $state("");
  let price = $state("");

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const points = Math.floor(Number(price));
    if (!name.trim() || !(points >= 1)) return;
    await actions.addReward(name, points);
    name = "";
    price = "";
  }
</script>

<Companion whole />

<div style="display:flex;align-items:center;gap:8px;margin-top:12px">
  <strong class="grow" style="font-size:1.15rem">{data.card.name || "Your companion"}</strong>
  <span class="muted small">{data.style.name}</span>
  <button class="btn small" onclick={() => (ui.overlay = "companion")}>Customize</button>
</div>

{#if ui.checkin?.date !== data.today}
  <div class="card" style="margin-top:12px;padding:12px 14px">
    <p style="margin-bottom:8px">How is today going?</p>
    <div class="chips">
      {#each MOODS as { mood, label } (mood)}
        <button class="chip" onclick={() => checkIn(mood)}>{label}</button>
      {/each}
    </div>
  </div>
{/if}

<div class="card" style="margin-top:16px;padding:12px 14px">
  <div style="display:flex;align-items:baseline;gap:8px">
    <strong style="flex:1">Bond level {bond.level}</strong>
    <span class="muted small">{bond.into}/{bond.span}</span>
  </div>
  <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={bond.span} aria-valuenow={bond.into} aria-label="Progress to next bond level">
    <span style:width="{(100 * bond.into) / bond.span}%"></span>
  </div>
  <p class="muted small" style="margin-top:6px">Grows with everything you finish and every day you show up. Higher levels unlock new things to say: {lines.have} of {lines.total} so far.</p>
</div>

<Stats />
{#if data.game.streak.days}
  <p class="muted small" style="margin:8px 4px 0">
    {data.game.streak.graceLeft ? "One missed day this week won't break the streak." : "This week's grace day has been used."}
  </p>
{/if}

<Quests />

<div class="section-head">
  <h2>Rewards</h2>
  <span class="count">{data.game.balance} to spend</span>
</div>
<div class="card">
  {#each data.rewards as reward (reward.id)}
    {@const short = reward.price - data.game.balance}
    <div class="field">
      <span class="grow">
        {reward.name}
        {#if short > 0}<span class="muted small" style="display:block">{short} more to go</span>{/if}
      </span>
      <button class="btn small primary" disabled={short > 0} onclick={() => buyReward(reward)}>
        <Icon name="gift" size={16} />{reward.price}
      </button>
      <button
        class="icon-btn"
        style="width:36px;height:36px;margin-right:-8px"
        aria-label="Remove {reward.name}"
        onclick={async () => toast(`Removed ${reward.name}`, await actions.removeReward(reward))}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  {/each}
  <form class="field" onsubmit={add}>
    <input class="grow" type="text" bind:value={name} placeholder="Something you want" aria-label="Reward" />
    <input type="number" inputmode="numeric" min="1" bind:value={price} placeholder="Pts" aria-label="Price in points" style="width:72px" />
    <button class="btn small" type="submit" disabled={!name.trim() || !(Number(price) >= 1)}>Add</button>
  </form>
</div>
<p class="muted small" style="margin:8px 4px 0">Set your own prices. Buying a reward spends the points and keeps it on the list for next time.</p>

<div class="section-head">
  <h2>Last 8 weeks</h2>
  <span class="count">{weeks.at(-1)?.count ?? 0} this week</span>
</div>
<div class="card">
  <div class="weeks" role="img" aria-label="Things finished each week: {weeks.map((week) => week.count).join(', ')}">
    {#each weeks as week, index (week.week)}
      <div class="week" class:now={index === weeks.length - 1}>
        <span>{week.count || ""}</span>
        <i style:height="{(100 * week.count) / most}%"></i>
      </div>
    {/each}
  </div>
</div>

{#if waiting.length}
  <div class="section-head"><h2>Waiting longest</h2></div>
  <div class="card">
    {#each waiting as { chore, days } (chore.id)}
      <button class="field" style="width:100%;text-align:left" onclick={() => (ui.choreId = chore.id)}>
        <span class="grow">{chore.name}</span>
        <span class="muted small">{days} days</span>
      </button>
    {/each}
  </div>
{/if}

{#if milestones.length}
  <div class="section-head"><h2>Milestones</h2></div>
  <div class="card">
    {#each milestones as entry (entry.at)}
      <div class="field">
        <span class="grow">{entry.text}</span>
        <span class="muted small" style="flex:none">{describeDue(localDate(entry.at), data.today)}</span>
      </div>
    {/each}
  </div>
{/if}

{#if said.length}
  <div class="section-head"><h2>Said lately</h2></div>
  <div class="card">
    {#each said as entry (entry.at)}
      <div class="field">
        <span class="grow">{entry.text}</span>
        <span class="muted small" style="flex:none">{describeDue(localDate(entry.at), data.today)}</span>
      </div>
    {/each}
  </div>
{/if}
