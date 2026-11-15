<script lang="ts">
  // Everything completed, newest first. Tap a circle to bring an item back.
  import { formatDate, localDate } from "../lib/dates.ts";
  import { isArchived } from "../lib/items.ts";
  import type { Item } from "../lib/model.ts";
  import { actions, data, toast, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";
  import ItemRow from "../ui/ItemRow.svelte";

  const days = $derived.by(() => {
    const groups = new Map<string, Item[]>();
    const done = data.items.filter(isArchived).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    for (const item of done) {
      const day = localDate(item.doneAt ?? 0);
      groups.set(day, [...(groups.get(day) ?? []), item]);
    }
    return [...groups.entries()];
  });

  let confirming = $state(false);

  async function empty() {
    confirming = false;
    const { count, undo } = await actions.emptyArchive();
    toast(`Deleted ${count} archived ${count === 1 ? "item" : "items"}`, undo);
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Archive">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={() => (ui.overlay = null)}><Icon name="back" /></button>
    <h2>Archive</h2>
  </div>
  <div class="sheet-body">
    {#each days as [day, items] (day)}
      <div class="section-head"><h2>{day === data.today ? "Today" : formatDate(day, data.today)}</h2></div>
      <div class="card">
        {#each items as item (item.id)}<ItemRow {item} showList />{/each}
      </div>
    {:else}
      <p class="empty"><strong>Nothing here yet</strong>Completed to-dos and bought shopping entries are kept here.</p>
    {/each}

    {#if days.length}
      <div style="margin-top:24px;display:flex;gap:8px">
        {#if confirming}
          <button class="btn" style="flex:1" onclick={() => (confirming = false)}>Cancel</button>
          <button class="btn danger" style="flex:1" onclick={empty}>Delete all archived</button>
        {:else}
          <button class="btn danger" style="flex:1" onclick={() => (confirming = true)}><Icon name="trash" size={18} />Empty archive</button>
        {/if}
      </div>
    {/if}
  </div>
</div>
