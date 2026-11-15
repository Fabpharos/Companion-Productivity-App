<script lang="ts">
  // The list of trips, soonest first, and the form for a new one.
  import { TEMPLATES } from "../../content/trips.ts";
  import { addDays, formatDate } from "../lib/dates.ts";
  import { countdown } from "../lib/trips.ts";
  import { actions, data, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";

  const upcoming = $derived(data.trips.filter((trip) => data.today <= trip.end));
  const past = $derived(data.trips.filter((trip) => data.today > trip.end).reverse());

  let adding = $state(false);
  let templateId = $state("japan");
  let name = $state("");
  let start = $state("");
  let end = $state("");
  const template = $derived(TEMPLATES.find((other) => other.id === templateId) ?? TEMPLATES[0]!);
  const valid = $derived(Boolean((name.trim() || template.destination) && start && end && end >= start));

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!valid) return;
    const trip = await actions.addTrip({ name: name.trim() || template.destination, start, end }, template);
    adding = false;
    name = start = end = "";
    ui.openTrip(trip.id);
  }
</script>

{#snippet row(trip: (typeof data.trips)[number])}
  <button class="nav-row" onclick={() => ui.openTrip(trip.id)}>
    <span class="glyph"><Icon name="trips" size={20} /></span>
    <span class="name">
      {trip.name}
      <span class="muted small" style="display:block;font-weight:400">{formatDate(trip.start, data.today)} to {formatDate(trip.end, data.today)}</span>
    </span>
    <span class="count">{countdown(trip, data.today).text}</span>
    <span class="chev"><Icon name="next" size={18} /></span>
  </button>
{/snippet}

{#if upcoming.length}
  <div class="card" style="margin-top:8px">
    {#each upcoming as trip (trip.id)}{@render row(trip)}{/each}
  </div>
{:else if !adding}
  <p class="empty"><strong>No trips planned</strong>A trip gets a countdown, a packing list, tasks before leaving, an itinerary and a budget.</p>
{/if}

{#if adding}
  <form class="card" style="margin-top:12px" onsubmit={add}>
    <div class="field stack">
      <div class="seg" role="group" aria-label="Start from">
        {#each TEMPLATES as option (option.id)}
          <button type="button" aria-pressed={templateId === option.id} onclick={() => (templateId = option.id)}>{option.name}</button>
        {/each}
      </div>
      <p class="muted small">
        {template.id === "general"
          ? "Starts with a general packing list and tasks before leaving."
          : `Adds ${template.name}-specific tasks, packing items and phrase cards to the general ones.`}
      </p>
    </div>
    <label class="field">
      <span class="label">Name</span>
      <input class="grow" type="text" bind:value={name} placeholder={template.destination || "Where to"} />
    </label>
    <label class="field">
      <span class="label">Leaves</span>
      <input class="grow" type="date" bind:value={start} min={addDays(data.today, -365)} onchange={() => end < start && (end = start)} />
    </label>
    <label class="field">
      <span class="label">Returns</span>
      <input class="grow" type="date" bind:value={end} min={start} />
    </label>
    <div class="field">
      <button class="btn" type="button" style="flex:1" onclick={() => (adding = false)}>Cancel</button>
      <button class="btn primary" type="submit" style="flex:1" disabled={!valid}>Create trip</button>
    </div>
  </form>
{:else}
  <button class="btn" style="width:100%;margin-top:12px" onclick={() => (adding = true)}><Icon name="plus" size={18} />New trip</button>
{/if}

{#if past.length}
  <div class="section-head"><h2>Past trips</h2></div>
  <div class="card">
    {#each past as trip (trip.id)}{@render row(trip)}{/each}
  </div>
{/if}
