<script lang="ts">
  import { search } from "../lib/search.ts";
  import { data, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";
  import ItemRow from "../ui/ItemRow.svelte";

  let query = $state("");
  const hits = $derived(search(data.items, data.lists, query));
  const active = $derived(hits.filter((hit) => !hit.archived));
  const archived = $derived(hits.filter((hit) => hit.archived));
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Search">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={() => (ui.overlay = null)}><Icon name="back" /></button>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="search-box"
      type="search"
      bind:value={query}
      placeholder="Search everything"
      aria-label="Search"
      autocomplete="off"
      autocapitalize="none"
      enterkeyhint="search"
      autofocus
    />
    <span style="width:8px"></span>
  </div>
  <div class="sheet-body">
    {#if !query.trim()}
      <p class="empty">Searches notes, to-dos, shopping and the archive. Use #tag to search by tag.</p>
    {:else if !hits.length}
      <p class="empty"><strong>No matches</strong>Nothing contains "{query.trim()}".</p>
    {:else}
      {#if active.length}
        <div class="card">
          {#each active as hit (hit.item.id)}<ItemRow item={hit.item} showList />{/each}
        </div>
      {/if}
      {#if archived.length}
        <div class="section-head"><h2>Archive</h2><span class="count">{archived.length}</span></div>
        <div class="card">
          {#each archived as hit (hit.item.id)}<ItemRow item={hit.item} showList />{/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
