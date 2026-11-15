<script lang="ts">
  // One trip entry, of any kind. The fields shown depend on what it is.
  // Changes save as they are made.
  import { addDays, formatDate } from "../lib/dates.ts";
  import type { TripEntry } from "../lib/model.ts";
  import { mapLink, parseAmount, taskDue, tripDays } from "../lib/trips.ts";
  import { actions, data, removeEntry, ui } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  let { id }: { id: string } = $props();

  const TITLES: Record<TripEntry["kind"], string> = {
    packing: "Packing item",
    task: "Before I leave",
    stop: "Stop",
    wish: "Wish",
    expense: "Expense",
    phrase: "Phrase card",
    souvenir: "Souvenir",
    journal: "Journal",
  };

  const entry = $derived(data.tripEntries.find((other) => other.id === id));
  const trip = $derived(data.trips.find((other) => other.id === entry?.tripId));
  const days = $derived(trip ? tripDays(trip) : []);
  // svelte-ignore state_referenced_locally
  let text = $state(entry?.text ?? "");

  function change(fields: Partial<TripEntry>) {
    if (entry) void actions.saveEntry({ ...entry, ...fields });
  }

  /** A wish given a day becomes a stop on the itinerary, and a stop with its day removed goes back to the wish-list. */
  function setDay(day: string) {
    change(day ? { day, kind: "stop" } : { day: null, time: null, kind: "wish" });
  }

  function close() {
    if (entry && text.trim() && text.trim() !== entry.text) change({ text: text.trim() });
    ui.entryId = null;
  }

  const field = (key: keyof TripEntry) => (event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
    change({ [key]: event.currentTarget.value.trim() || null });
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Edit">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={close}><Icon name="back" /></button>
    <h2>{entry ? TITLES[entry.kind] : "Entry"}</h2>
    <button class="done" onclick={close}>Done</button>
  </div>

  {#if entry && trip}
    <div class="sheet-body">
      <div class="card">
        <textarea
          class="text"
          class:tall={entry.kind === "journal"}
          bind:value={text}
          onblur={() => text.trim() && change({ text: text.trim() })}
          aria-label="Text"
        ></textarea>
      </div>

      <div class="card" style="margin-top:12px">
        {#if entry.kind === "packing"}
          <label class="field">
            <span class="label">Category</span>
            <input class="grow" type="text" value={entry.category ?? ""} onchange={field("category")} placeholder="Other" />
          </label>
        {/if}

        {#if entry.kind === "task"}
          <label class="field">
            <span class="label">Due</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              value={entry.daysBefore ?? 0}
              onchange={(event) => change({ daysBefore: Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)) })}
            />
            <span class="grow muted small">days before leaving · {formatDate(taskDue(trip, entry), data.today)}</span>
          </label>
        {/if}

        {#if entry.kind === "stop" || entry.kind === "wish"}
          <label class="field">
            <span class="label">Day</span>
            <select class="grow" value={entry.day ?? ""} onchange={(event) => setDay(event.currentTarget.value)}>
              <option value="">Wish-list, no day yet</option>
              {#each days as day, index (day)}<option value={day}>Day {index + 1} · {formatDate(day, data.today)}</option>{/each}
              {#if entry.day && !days.includes(entry.day)}<option value={entry.day}>{formatDate(entry.day, data.today)}</option>{/if}
            </select>
          </label>
          {#if entry.kind === "stop" && entry.day}
            <div class="field">
              <span class="label">Move</span>
              <div class="grow" style="display:flex;gap:8px">
                <button class="btn small" style="flex:1" onclick={() => change({ day: addDays(entry.day!, -1) })}>Day earlier</button>
                <button class="btn small" style="flex:1" onclick={() => change({ day: addDays(entry.day!, 1) })}>Day later</button>
              </div>
            </div>
            <label class="field">
              <span class="label">Time</span>
              <input class="grow input" type="time" value={entry.time ?? ""} onchange={field("time")} />
            </label>
          {/if}
          <label class="field">
            <span class="label">Place</span>
            <input class="grow" type="text" value={entry.place ?? ""} onchange={field("place")} placeholder="Name, address or a maps link" />
          </label>
          <label class="field stack">
            <span class="label" style="width:auto">Notes</span>
            <textarea class="input" style="min-height:80px;padding:10px" value={entry.note} onchange={(event) => change({ note: event.currentTarget.value })}
            ></textarea>
          </label>
        {/if}

        {#if entry.kind === "expense"}
          <label class="field">
            <span class="label">Amount</span>
            <input
              class="grow"
              type="text"
              inputmode="decimal"
              value={entry.amount ?? ""}
              onchange={(event) => change({ amount: parseAmount(event.currentTarget.value) })}
            />
            <span class="muted">{trip.localCurrency || trip.homeCurrency}</span>
          </label>
        {/if}

        {#if entry.kind === "expense" || entry.kind === "journal"}
          <label class="field">
            <span class="label">Date</span>
            <input class="grow" type="date" value={entry.day ?? ""} onchange={field("day")} />
          </label>
        {/if}

        {#if entry.kind === "phrase"}
          <label class="field">
            <span class="label">Reading</span>
            <input class="grow" type="text" value={entry.reading ?? ""} onchange={field("reading")} placeholder="How to say it" />
          </label>
          <label class="field">
            <span class="label">Meaning</span>
            <input class="grow" type="text" value={entry.meaning ?? ""} onchange={field("meaning")} />
          </label>
          <label class="field">
            <span class="label">Situation</span>
            <input class="grow" type="text" value={entry.category ?? ""} onchange={field("category")} placeholder="Other" />
          </label>
        {/if}

        {#if entry.kind === "souvenir"}
          <label class="field">
            <span class="label">For</span>
            <input class="grow" type="text" value={entry.forWhom ?? ""} onchange={field("forWhom")} placeholder="Who it is for" />
          </label>
        {/if}
      </div>

      <div style="display:flex;gap:8px;margin-top:20px">
        {#if entry.kind === "stop" || entry.kind === "wish"}
          <a class="btn" style="flex:1;text-decoration:none" href={mapLink(entry)} target="_blank" rel="noopener">
            <Icon name="trips" size={18} />Open in Maps
          </a>
        {/if}
        <button class="btn danger" style="flex:1" onclick={() => removeEntry(entry)}><Icon name="trash" size={18} />Delete</button>
      </div>
    </div>
  {:else}
    <p class="empty">This entry no longer exists.</p>
  {/if}
</div>
