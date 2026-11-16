<script lang="ts">
  // NovelAI: the token, what it may do, the everyday look everything else is
  // drawn from, and the outfits for each situation.
  import { customId, defaultLook, isGenerated, rulesFor, withoutRule, withRule } from "../lib/outfits.ts";
  import { cardReady, checkAccount, clearDrawn, draw, nai, setNovelAi } from "../novelai.svelte.ts";
  import { data, saveCard } from "../state.svelte.ts";
  import Candidate from "./Candidate.svelte";
  import Icon from "./Icon.svelte";

  const TIERS = ["No subscription", "Tablet", "Scroll", "Opus"];

  const settings = $derived(data.nai);
  const ready = $derived(cardReady());
  const everyday = $derived(defaultLook(data.card));
  const hasBase = $derived(data.images.some((image) => image.id === `nai:${everyday.key}:idle`));
  const drawnCount = $derived(data.images.filter(isGenerated).length);
  const rules = $derived(rulesFor(data.card));

  let newName = $state("");
  let newTags = $state("");
  let confirmClear = $state(false);

  function addOutfit(event: SubmitEvent) {
    event.preventDefault();
    if (!newName.trim() || !newTags.trim()) return;
    saveCard({ outfitRules: withRule(data.card, customId(newName), newTags.trim()) });
    newName = "";
    newTags = "";
  }

  function removeOutfit(id: string) {
    saveCard({ outfitRules: withoutRule(data.card, id) });
    if (settings.wear === id) setNovelAi({ wear: null });
  }
</script>

<div class="section-head"><h2>NovelAI</h2></div>
<div class="card">
  <div class="field stack">
    <p class="muted small">
      Optional. NovelAI can draw the companion in an outfit for each situation and write what it says. Each picture is
      drawn once, shown to you to keep or redo, and then stored on the phone. The token is kept on this phone only and is
      sent only to NovelAI.
    </p>
    <input
      class="input"
      type="password"
      autocomplete="off"
      placeholder="Persistent API token"
      aria-label="NovelAI token"
      value={settings.token}
      onchange={(event) => setNovelAi({ token: event.currentTarget.value.trim() })}
    />
    <button class="btn small" disabled={nai.busy || !settings.token} onclick={checkAccount}>Check the account</button>
    {#if nai.account}
      <p class="small">
        {TIERS[nai.account.tier] ?? `Tier ${nai.account.tier}`} · {nai.account.anlas.toLocaleString()} Anlas{nai.account.usage
          ? ` · ${Math.round(nai.account.usage.percent)}% of the V5 allowance left`
          : ""}
      </p>
    {/if}
  </div>
  <div class="field">
    <span class="grow">
      Write what the companion says
      <span class="muted small" style="display:block">In the card's voice. The pre-set line shows first, and stays if NovelAI is slow</span>
    </span>
    <button class="switch" role="switch" aria-checked={settings.text} aria-label="Write what the companion says" disabled={!settings.token} onclick={() => setNovelAi({ text: !settings.text })}
    ></button>
  </div>
  <div class="field">
    <span class="grow">
      Draw the companion
      <span class="muted small" style="display:block">
        {ready ? "Starts once the everyday look below is approved" : "Needs a name and a base prompt in the card first"}
      </span>
    </span>
    <button
      class="switch"
      role="switch"
      aria-checked={settings.images}
      aria-label="Draw the companion"
      disabled={!settings.token || !ready}
      onclick={() => setNovelAi({ images: !settings.images })}
    ></button>
  </div>
  {#if settings.images}
    <div class="field">
      <span class="grow">
        Draw new looks on its own
        <span class="muted small" style="display:block">Only when it costs nothing. Off, a look is drawn when you ask</span>
      </span>
      <button class="switch" role="switch" aria-checked={settings.auto} aria-label="Draw new looks on its own" onclick={() => setNovelAi({ auto: !settings.auto })}></button>
    </div>
    {#if settings.auto}
      <label class="field">
        <span class="grow">At most, each day</span>
        <select style="width:auto" value={String(settings.dailyCap)} onchange={(event) => setNovelAi({ dailyCap: Number(event.currentTarget.value) })}>
          {#each [1, 2, 3, 5, 10] as cap (cap)}<option value={String(cap)}>{cap}</option>{/each}
        </select>
      </label>
    {/if}
  {/if}
</div>

{#if settings.images && settings.token && ready}
  <div class="section-head"><h2>Everyday look</h2></div>
  <div class="card">
    <div class="field stack">
      <p class="muted small">
        {hasBase
          ? "Approved. Every other outfit is drawn from the same character and seed. Changing the base prompt or the default outfit starts over with new pictures."
          : "Draw the companion in its default outfit and keep the one you like. That picture becomes the card's picture, and the character every outfit is drawn from."}
      </p>
      <button class="btn" class:primary={!hasBase} disabled={nai.busy} onclick={() => draw(everyday, "idle", { manual: true, fresh: hasBase })}>
        {nai.busy ? "Drawing…" : hasBase ? "Draw it again" : "Draw the everyday look"}
      </button>
      <Candidate />
    </div>
  </div>

  <div class="section-head"><h2>Outfits</h2></div>
  <div class="card">
    <label class="field">
      <span class="grow">Wearing</span>
      <select style="width:auto;max-width:60%" value={settings.wear ?? ""} onchange={(event) => setNovelAi({ wear: event.currentTarget.value || null })}>
        <option value="">By situation</option>
        <option value="default">Everyday</option>
        {#each rules.filter((rule) => rule.tags.trim()) as rule (rule.id)}<option value={rule.id}>{rule.label}</option>{/each}
      </select>
    </label>
    <div class="field stack">
      <span class="muted small">A trip's outfit is set on the trip. For the rest, the first that applies is worn. Leave one empty to skip it.</span>
    </div>
    {#each rules as rule (rule.id)}
      <label class="field stack" style="padding-top:6px;padding-bottom:6px">
        <span class="small" style="display:flex;align-items:center;gap:8px">
          <span class="grow">{rule.label}{rule.custom ? " · chosen by hand" : ""}</span>
          {#if rule.custom}
            <button class="icon-btn" style="width:32px;height:32px" type="button" aria-label="Remove {rule.label}" onclick={() => removeOutfit(rule.id)}>
              <Icon name="close" size={16} />
            </button>
          {/if}
        </span>
        <input
          class="input"
          type="text"
          autocapitalize="none"
          autocomplete="off"
          placeholder="No outfit"
          value={rule.tags}
          onchange={(event) => saveCard({ outfitRules: withRule(data.card, rule.id, event.currentTarget.value.trim()) })}
        />
      </label>
    {/each}
    <form class="field stack" onsubmit={addOutfit}>
      <span class="muted small">Add an outfit of your own</span>
      <input class="input" type="text" autocomplete="off" placeholder="Name, such as Festival" aria-label="Outfit name" bind:value={newName} />
      <input class="input" type="text" autocapitalize="none" autocomplete="off" placeholder="Tags, such as yukata, hair flower" aria-label="Outfit tags" bind:value={newTags} />
      <button class="btn small" type="submit" disabled={!newName.trim() || !newTags.trim()}>Add outfit</button>
    </form>
  </div>

  {#if drawnCount}
    <div style="margin-top:12px">
      {#if confirmClear}
        <div class="banner" style="margin:0" role="alert">
          <p>Remove all {drawnCount} pictures NovelAI has drawn? The everyday look will need approving again.</p>
          <button class="btn small" onclick={() => (confirmClear = false)}>Cancel</button>
          <button
            class="btn small danger"
            onclick={async () => {
              await clearDrawn();
              confirmClear = false;
            }}>Remove</button
          >
        </div>
      {:else}
        <button class="btn" style="width:100%" onclick={() => (confirmClear = true)}>Remove the {drawnCount} drawn {drawnCount === 1 ? "picture" : "pictures"}</button>
      {/if}
    </div>
  {/if}
{:else if nai.error}
  <p class="small" style="color:var(--bad);margin-top:8px" role="alert">{nai.error}</p>
{/if}
