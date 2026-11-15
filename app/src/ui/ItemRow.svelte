<script lang="ts">
  // One item in a list. Tap the text to open it, tap the circle to complete it,
  // swipe right to complete or left to delete.
  import { describeDue, describeRepeat, formatTime } from "../lib/dates.ts";
  import { isOpen, title } from "../lib/items.ts";
  import type { Item } from "../lib/model.ts";
  import { complete, data, remove, reopen, toggleFocus, ui } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  let { item, showList = false, star = false }: { item: Item; showList?: boolean; star?: boolean } = $props();

  const TRIGGER = 88;
  const open = $derived(isOpen(item));
  const checkable = $derived(item.kind !== "note");
  const preview = $derived(item.kind === "note" ? item.text.split("\n").slice(1).join(" ").trim() : "");
  const steps = $derived(item.subtasks.length ? `${item.subtasks.filter((step) => step.done).length}/${item.subtasks.length}` : "");
  const listName = $derived(showList ? data.list(item.listId)?.name : undefined);

  let dx = $state(0);
  let dragging = $state(false);
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let swiped = false;

  function toggle() {
    void (open ? complete(item) : reopen(item));
  }

  function down(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tracking = true;
    swiped = false;
    startX = event.clientX;
    startY = event.clientY;
  }

  function move(event: PointerEvent) {
    if (!tracking) return;
    const x = event.clientX - startX;
    const y = event.clientY - startY;
    if (!dragging) {
      if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) tracking = false;
      else if (Math.abs(x) > 10) {
        dragging = true;
        swiped = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }
      return;
    }
    // Swiping right does nothing on rows that cannot be completed.
    dx = x > 0 && !(checkable && open) ? 0 : x;
  }

  function up() {
    if (dragging) {
      if (dx >= TRIGGER) void complete(item);
      else if (dx <= -TRIGGER) void remove(item);
    }
    tracking = false;
    dragging = false;
    dx = 0;
  }

  function openItem() {
    // A swipe ends with a click on whatever is under the finger. That is not a tap.
    if (swiped) return;
    ui.editId = item.id;
  }
</script>

<div class="row-wrap">
  {#if dx > 0}
    <div class="row-under done">{item.kind === "shopping" ? "Got it" : "Done"}</div>
  {:else if dx < 0}
    <div class="row-under delete">Delete</div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row"
    class:settle={!dragging}
    class:is-done={!open}
    style:transform={dx ? `translateX(${dx}px)` : undefined}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    {#if checkable}
      <button class="check" role="checkbox" aria-checked={!open} aria-label={open ? "Complete" : "Restore"} onclick={toggle}>
        <span class="box p{open ? item.priority : 0}" class:square={item.kind === "shopping"} class:on={!open}>
          <Icon name="check" size={16} />
        </span>
      </button>
    {/if}
    <button class="body" onclick={openItem}>
      <span class="title">{title(item) || "Empty"}</span>
      {#if preview}<span class="preview">{preview}</span>{/if}
      {#if item.due || item.repeat || steps || item.tags.length || listName || item.pinned || (item.staple && open)}
        <span class="meta">
          {#if item.pinned}<span><Icon name="pin" size={13} />Pinned</span>{/if}
          {#if item.due}
            <span class:late={open && item.due < data.today} class:soon={open && item.due === data.today}>
              {describeDue(item.due, data.today)}{item.time ? `, ${formatTime(item.time)}` : ""}
            </span>
          {/if}
          {#if item.repeat}<span><Icon name="repeat" size={13} />{describeRepeat(item.repeat)}</span>{/if}
          {#if steps}<span>{steps} steps</span>{/if}
          {#if item.staple && open}<span>Staple</span>{/if}
          {#each item.tags as tag (tag)}<span>#{tag}</span>{/each}
          {#if listName}<span>{listName}</span>{/if}
        </span>
      {/if}
    </button>
    {#if star && item.kind === "todo" && open}
      {@const on = item.focusOn === data.today}
      <button class="side" class:on aria-pressed={on} aria-label="One of today's three" onclick={() => toggleFocus(item)}>
        <Icon name="star" size={20} filled={on} />
      </button>
    {/if}
  </div>
</div>
