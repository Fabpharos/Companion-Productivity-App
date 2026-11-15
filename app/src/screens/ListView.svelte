<script lang="ts">
  // One list. What it shows depends on the kind of list: an inbox to sort,
  // to-dos by date, shopping by store section, or notes with tag filters.
  import { compareNotes, compareTodos, isOpen, shoppingView, tagCounts } from "../lib/items.ts";
  import type { Item, ItemKind, List } from "../lib/model.ts";
  import { actions, data, toast, ui } from "../state.svelte.ts";
  import ItemRow from "../ui/ItemRow.svelte";

  let { list }: { list: List } = $props();

  const FILE_AS: { kind: ItemKind; label: string }[] = [
    { kind: "todo", label: "To-do" },
    { kind: "shopping", label: "Shopping" },
    { kind: "note", label: "Keep as note" },
  ];

  const all = $derived(data.items.filter((item) => item.listId === list.id));
  const open = $derived(all.filter(isOpen));
  const shopping = $derived(shoppingView(all));
  const tags = $derived(tagCounts(open));

  let tag = $state<string | null>(null);
  // A filter for a tag that no longer exists would hide everything.
  const activeTag = $derived(tag && tags.some(([name]) => name === tag) ? tag : null);

  const sorted = $derived(
    open
      .filter((item) => !activeTag || item.tags.includes(activeTag))
      .sort(list.kind === "note" ? compareNotes : list.kind === "todo" ? compareTodos : (a: Item, b: Item) => b.createdAt - a.createdAt),
  );

  // svelte-ignore state_referenced_locally
  let name = $state(list.name);

  async function deleteList() {
    const undo = await actions.deleteList(list);
    ui.go("lists");
    toast(`Deleted ${list.name}`, undo);
  }

  async function restock() {
    const { count, undo } = await actions.restockStaples(list.id);
    toast(`Restocked ${count} ${count === 1 ? "staple" : "staples"}`, undo);
  }
</script>

{#if list.kind === "shopping"}
  {#each shopping.sections as group (group.section)}
    <div class="section-head">
      <h2>{group.section}</h2>
      <span class="count">{group.items.length}</span>
    </div>
    <div class="card">
      {#each group.items as item (item.id)}<ItemRow {item} />{/each}
    </div>
  {:else}
    <p class="empty">
      <strong>Nothing to buy</strong>
      {shopping.stocked.length ? "Restock staples below, or add something above." : "Type groceries above. Commas add several at once."}
    </p>
  {/each}

  {#if shopping.stocked.length}
    <div class="section-head">
      <h2>Staples in stock</h2>
      <button class="link" onclick={restock}>Restock all</button>
    </div>
    <div class="card">
      {#each shopping.stocked as item (item.id)}<ItemRow {item} />{/each}
    </div>
    <p class="muted small" style="margin:8px 4px 0">Tap a circle to put one staple back on the list.</p>
  {/if}
{:else}
  {#if list.kind !== "inbox" && tags.length}
    <div class="chips" style="margin:8px 0 12px">
      {#each tags as [name, count] (name)}
        <button class="chip" aria-pressed={activeTag === name} onclick={() => (tag = activeTag === name ? null : name)}>
          #{name} <span class="muted">{count}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if sorted.length}
    <div class="card" style="margin-top:8px">
      {#each sorted as item (item.id)}
        <div>
          <ItemRow {item} star={list.kind === "todo"} />
          {#if list.kind === "inbox"}
            <div class="row-actions">
              {#each FILE_AS as option (option.kind)}
                <button class="chip" onclick={() => actions.changeKind(item, option.kind)}>{option.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if list.kind === "inbox"}
    <p class="empty"><strong>Inbox is empty</strong>Captures without a clear home wait here until you sort them.</p>
  {:else if list.kind === "note"}
    <p class="empty"><strong>No notes yet</strong>Type one above. Add #tags to group notes.</p>
  {:else}
    <p class="empty"><strong>All clear</strong>Type a to-do above. End with a day, like "tomorrow" or "friday", to set a due date.</p>
  {/if}
{/if}

{#if !list.builtin}
  <div class="section-head" style="margin-top:36px"><h2>This list</h2></div>
  <div class="card">
    <form
      class="field"
      onsubmit={(event) => {
        event.preventDefault();
        void actions.renameList(list, name);
      }}
    >
      <input class="grow" type="text" bind:value={name} aria-label="List name" />
      <button class="btn small" type="submit" disabled={!name.trim() || name.trim() === list.name}>Rename</button>
    </form>
    <div class="field">
      <span class="grow muted small">Deleting the list deletes the {all.length} {all.length === 1 ? "item" : "items"} on it.</span>
      <button class="btn small danger" onclick={deleteList}>Delete list</button>
    </div>
  </div>
{/if}
