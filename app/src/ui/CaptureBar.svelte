<script lang="ts">
  // The capture box at the top of every screen. After adding, it shows where
  // the entry went and lets one tap file it as something else.
  import { describeDue } from "../lib/dates.ts";
  import type { ItemKind, List } from "../lib/model.ts";
  import { addChore, capture, data, dismissCaptured, recapture, ui } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  // On the Chores tab the box adds chores instead.
  let { list, chores = false }: { list?: List; chores?: boolean } = $props();

  const KINDS: { kind: ItemKind; label: string }[] = [
    { kind: "note", label: "Note" },
    { kind: "todo", label: "To-do" },
    { kind: "shopping", label: "Shopping" },
  ];

  let text = $state("");
  const target = $derived(list && list.kind !== "inbox" ? list : undefined);

  const summary = $derived.by(() => {
    const first = ui.captured?.items[0];
    if (!ui.captured || !first) return null;
    const where = data.list(first.listId)?.name ?? "the list";
    if (ui.captured.items.length > 1) return { kind: first.kind, text: `Added ${ui.captured.items.length} entries to ${where}` };
    const detail = first.kind === "shopping" ? first.section : first.due ? `due ${describeDue(first.due, data.today).toLowerCase()}` : null;
    return { kind: first.kind, text: `Added to ${where}${detail ? ` · ${detail}` : ""}` };
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const raw = text.trim();
    if (!raw) return;
    text = "";
    if (chores) await addChore(raw);
    else await capture(raw, list);
  }
</script>

<div class="capture">
  <form onsubmit={submit}>
    <input
      bind:value={text}
      type="text"
      enterkeyhint="done"
      autocomplete="off"
      autocapitalize="sentences"
      placeholder={chores ? "Add a chore, like \"Vacuum weekly\"" : target ? `Add to ${target.name}` : "Capture a note, to-do or grocery"}
      aria-label="Quick capture"
    />
    <button class="add" type="submit" disabled={!text.trim()} aria-label="Add"><Icon name="plus" size={20} /></button>
  </form>
  {#if summary && !chores}
    <div class="captured" role="status">
      <span class="what">{summary.text}</span>
      <span>File as</span>
      {#each KINDS as { kind, label } (kind)}
        <button class="chip" aria-pressed={summary.kind === kind} onclick={() => summary.kind !== kind && recapture(kind)}>{label}</button>
      {/each}
      <button class="icon-btn" style="width:32px;height:32px;margin-left:auto" aria-label="Dismiss" onclick={dismissCaptured}>
        <Icon name="close" size={16} />
      </button>
    </div>
  {/if}
</div>
