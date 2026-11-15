<script lang="ts">
  import { backupReminderDue } from "../lib/backup.ts";
  import { INBOX, type Item } from "../lib/model.ts";
  import { FOCUS_SLOTS, suggestFocus, todayView } from "../lib/today.ts";
  import { actions, data, toast, ui } from "../state.svelte.ts";
  import Companion from "../ui/Companion.svelte";
  import ItemRow from "../ui/ItemRow.svelte";
  import Quests from "../ui/Quests.svelte";

  const view = $derived(todayView(data.items, data.today));
  const suggestions = $derived(suggestFocus(data.items, data.today));
  const emptySlots = $derived(Math.max(0, FOCUS_SLOTS - view.focus.length));
  const backupDue = $derived(backupReminderDue(data.settings, data.items, data.now));
  const quiet = $derived(!view.focus.length && !view.overdue.length && !view.dueToday.length && !view.upcoming.length);

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
