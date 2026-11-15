<script lang="ts">
  import { backupReminderDue } from "../lib/backup.ts";
  import { INBOX, type Item } from "../lib/model.ts";
  import { describeDue, formatDate } from "../lib/dates.ts";
  import { FOCUS_SLOTS, suggestFocus, todayView } from "../lib/today.ts";
  import { countdown, itinerary, mapLink, tasksComingDue } from "../lib/trips.ts";
  import { actions, data, toast, toggleEntry, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";
  import Companion from "../ui/Companion.svelte";
  import ItemRow from "../ui/ItemRow.svelte";
  import Quests from "../ui/Quests.svelte";

  const view = $derived(todayView(data.items, data.today));
  const suggestions = $derived(suggestFocus(data.items, data.today));
  const emptySlots = $derived(Math.max(0, FOCUS_SLOTS - view.focus.length));
  const backupDue = $derived(backupReminderDue(data.settings, data.items, data.now));
  const quiet = $derived(!view.focus.length && !view.overdue.length && !view.dueToday.length && !view.upcoming.length);

  const trip = $derived(data.trip);
  const tripCount = $derived(trip ? countdown(trip, data.today) : null);
  /** While travelling, today's stops lead the screen. */
  const stops = $derived(data.travelling ? (itinerary(data.travelling, data.tripEntries).find((day) => day.day === data.today)?.stops ?? []) : []);
  const tripTasks = $derived(tasksComingDue(data.trips, data.tripEntries, data.today));

  async function suggest() {
    toast(`Picked ${suggestions.length} for today`, await actions.focusAll(suggestions));
  }
</script>

{#snippet group(heading: string, items: Item[], bad = false)}
  {#if items.length}
    <div class="section-head">
      <h2 class:bad>{heading}</h2>
      <span class="count">{items.length}</span>
    </div>
    <div class="card">
      {#each items as item (item.id)}<ItemRow {item} star />{/each}
    </div>
  {/if}
{/snippet}

<Companion />

{#if trip && tripCount}
  <button class="trip-card" onclick={() => ui.openTrip(trip.id, data.travelling ? "itinerary" : "overview")}>
    <strong>{trip.name} · {tripCount.text}</strong>
    <span>{formatDate(trip.start, data.today)} to {formatDate(trip.end, data.today)}</span>
  </button>
{/if}

{#if data.travelling}
  <div class="section-head"><h2>Today's plan</h2></div>
  <div class="card">
    {#each stops as stop (stop.id)}
      <div class="row">
        <button class="body" onclick={() => (ui.entryId = stop.id)}>
          <span class="title">{#if stop.time}<span class="time">{stop.time}</span>{/if}{stop.text}</span>
          {#if stop.place || stop.note}<span class="preview">{[stop.place, stop.note].filter(Boolean).join(" · ")}</span>{/if}
        </button>
        <a class="side on" style="color:var(--accent)" href={mapLink(stop)} target="_blank" rel="noopener" aria-label="Open {stop.text} in Maps">
          <Icon name="trips" size={20} />
        </a>
      </div>
    {:else}
      <p class="empty">Nothing planned for today. A free day.</p>
    {/each}
  </div>
{/if}

{#if tripTasks.length}
  <div class="section-head"><h2>Before the trip</h2><span class="count">{tripTasks.length}</span></div>
  <div class="card">
    {#each tripTasks as row (row.entry.id)}
      <div class="row">
        <button class="check" role="checkbox" aria-checked="false" aria-label="Tick" onclick={() => toggleEntry(row.entry)}>
          <span class="box"><Icon name="check" size={16} /></span>
        </button>
        <button class="body" onclick={() => (ui.entryId = row.entry.id)}>
          <span class="title">{row.entry.text}</span>
          <span class="meta"><span class:late={row.late}>{describeDue(row.due, data.today)}</span><span>{row.trip.name}</span></span>
        </button>
      </div>
    {/each}
  </div>
{/if}

{#if backupDue}
  <div class="banner">
    <p>
      {data.settings.lastBackupAt ? "It has been two weeks since the last backup." : "Nothing here is backed up yet."}
      A backup file is the only copy outside this phone.
    </p>
    <button class="btn small primary" onclick={() => (ui.overlay = "settings")}>Back up</button>
    <button class="btn small" onclick={() => actions.snoozeBackupReminder(3)}>Later</button>
  </div>
{/if}

<div class="section-head">
  <h2>Today's three</h2>
  {#if emptySlots && suggestions.length}<button class="link" onclick={suggest}>Suggest</button>{/if}
</div>
<div class="card">
  {#each view.focus as item (item.id)}<ItemRow {item} star />{/each}
  {#each { length: emptySlots } as _, index (index)}
    <div class="slot">
      <span class="num">{view.focus.length + index + 1}</span>
      {#if index === 0}
        {view.focus.length ? "Star a to-do to add it" : "Star up to three to-dos to focus on today"}
      {/if}
    </div>
  {/each}
</div>

{@render group("Overdue", view.overdue, true)}
{@render group("Due today", view.dueToday)}
{@render group("Next 7 days", view.upcoming)}

{#if quiet}
  <p class="empty"><strong>Nothing due</strong>Capture something above, or pick a to-do from your lists.</p>
{/if}

<Quests />

{#if view.inboxCount}
  <div class="section-head"><h2>Inbox</h2></div>
  <div class="card">
    <button class="nav-row" onclick={() => ui.go("lists", INBOX)}>
      <span class="name">{view.inboxCount} {view.inboxCount === 1 ? "capture" : "captures"} waiting to be sorted</span>
      <span class="link">Sort</span>
    </button>
  </div>
{/if}

{@render group("Pinned notes", view.pinned)}
