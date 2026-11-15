<script lang="ts">
  // The index of lists: the four built-in ones, any custom ones, and the archive.
  import { isArchived, isOpen } from "../lib/items.ts";
  import type { ItemKind, ListKind } from "../lib/model.ts";
  import { actions, data, ui } from "../state.svelte.ts";
  import Icon, { type IconName } from "../ui/Icon.svelte";

  const GLYPH: Record<ListKind, IconName> = { inbox: "inbox", todo: "todo", shopping: "cart", note: "note" };
  const KINDS: { kind: ItemKind; label: string }[] = [
    { kind: "todo", label: "To-dos" },
    { kind: "shopping", label: "Shopping" },
    { kind: "note", label: "Notes" },
  ];

  const counts = $derived.by(() => {
    const open = new Map<string, number>();
    let archived = 0;
    for (const item of data.items) {
      if (isOpen(item)) open.set(item.listId, (open.get(item.listId) ?? 0) + 1);
      else if (isArchived(item)) archived++;
    }
    return { open, archived };
  });

  let adding = $state(false);
  let name = $state("");
  let kind = $state<ItemKind>("todo");

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const list = await actions.addList(name, kind);
    name = "";
    adding = false;
    ui.go("lists", list.id);
  }
</script>

<div class="card" style="margin-top:8px">
  {#each data.lists as list (list.id)}
    <button class="nav-row" onclick={() => ui.go("lists", list.id)}>
      <span class="glyph"><Icon name={GLYPH[list.kind]} size={20} /></span>
      <span class="name">{list.name}</span>
      <span class="count">{counts.open.get(list.id) ?? ""}</span>
      <span class="chev"><Icon name="next" size={18} /></span>
    </button>
  {/each}
</div>

{#if adding}
  <form class="card" style="margin-top:12px" onsubmit={add}>
    <div class="field stack">
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" type="text" bind:value={name} placeholder="List name" aria-label="List name" autofocus />
      <div class="seg" role="group" aria-label="Kind of list">
        {#each KINDS as option (option.kind)}
          <button type="button" aria-pressed={kind === option.kind} onclick={() => (kind = option.kind)}>{option.label}</button>
        {/each}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" type="button" style="flex:1" onclick={() => (adding = false)}>Cancel</button>
        <button class="btn primary" type="submit" style="flex:1" disabled={!name.trim()}>Create list</button>
      </div>
    </div>
  </form>
{:else}
  <button class="btn" style="width:100%;margin-top:12px" onclick={() => (adding = true)}><Icon name="plus" size={18} />New list</button>
{/if}

<div class="card" style="margin-top:20px">
  <button class="nav-row" onclick={() => (ui.overlay = "archive")}>
    <span class="glyph"><Icon name="archive" size={20} /></span>
    <span class="name">Archive</span>
    <span class="count">{counts.archived || ""}</span>
    <span class="chev"><Icon name="next" size={18} /></span>
  </button>
</div>
