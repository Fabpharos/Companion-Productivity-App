<script lang="ts">
  // The companion up close, the bond with it, the quests, and the wish-list
  // of rewards that points can buy.
  import { actions, buyReward, data, toast } from "../state.svelte.ts";
  import Companion from "../ui/Companion.svelte";
  import Icon from "../ui/Icon.svelte";
  import Quests from "../ui/Quests.svelte";
  import Stats from "../ui/Stats.svelte";

  const bond = $derived(data.game.bond);

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

<div class="card" style="margin-top:16px;padding:12px 14px">
  <div style="display:flex;align-items:baseline;gap:8px">
    <strong style="flex:1">Bond level {bond.level}</strong>
    <span class="muted small">{bond.into}/{bond.span}</span>
  </div>
  <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={bond.span} aria-valuenow={bond.into} aria-label="Progress to next bond level">
    <span style:width="{(100 * bond.into) / bond.span}%"></span>
  </div>
  <p class="muted small" style="margin-top:6px">Grows with everything you finish and every day you show up. Higher levels unlock new things to say.</p>
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
