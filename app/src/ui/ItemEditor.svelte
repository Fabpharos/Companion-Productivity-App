<script lang="ts">
  // The full view of one item. Every change is saved as it is made; there is
  // no save button to forget.
  import { SECTION_ORDER } from "../../content/groceries.ts";
  import { addDays, formatDate, localDate } from "../lib/dates.ts";
  import { isOpen, parseTags, retype, title } from "../lib/items.ts";
  import { newId, type Item, type ItemKind, type Priority } from "../lib/model.ts";
  import { FOCUS_SLOTS } from "../lib/today.ts";
  import { actions, complete, data, remove, reopen, startTimer, toast, ui } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  let { id }: { id: string } = $props();

  const KINDS: { kind: ItemKind; label: string }[] = [
    { kind: "note", label: "Note" },
    { kind: "todo", label: "To-do" },
    { kind: "shopping", label: "Shopping" },
  ];
  const PRIORITIES = ["None", "Low", "Medium", "High"];
  const REPEATS = [
    ["", "Does not repeat"],
    ["1 day", "Daily"],
    ["1 week", "Weekly"],
    ["2 week", "Every 2 weeks"],
    ["1 month", "Monthly"],
    ["3 month", "Every 3 months"],
    ["6 month", "Every 6 months"],
    ["1 year", "Yearly"],
  ] as const;

  // The editor works on its own copy, taken once when it opens.
  // svelte-ignore state_referenced_locally
  const original = data.items.find((item) => item.id === id);
  let draft = $state<Item | null>(original ? structuredClone(original) : null);
  let tagText = $state(original?.tags.join(" ") ?? "");
  let newStep = $state("");
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const lists = $derived(data.lists.filter((list) => list.kind === draft?.kind || list.kind === "inbox"));
  const sections = $derived([...new Set([...SECTION_ORDER, draft?.section ?? "Other"])]);
  const repeatKey = $derived(draft?.repeat ? `${draft.repeat.every} ${draft.repeat.unit}` : "");
  const focused = $derived(draft?.focusOn === data.today);

  function save() {
    clearTimeout(timer);
    if (!draft || !dirty) return;
    dirty = false;
    void actions.saveItem($state.snapshot(draft));
  }

  /** For typing: saves shortly after the last keystroke. */
  function touch() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  }

  /** For taps: saves at once. */
  function change(fields: Partial<Item>) {
    if (!draft) return;
    Object.assign(draft, fields);
    dirty = true;
    save();
  }

  function setKind(kind: ItemKind) {
    if (draft && draft.kind !== kind) change(retype($state.snapshot(draft), kind, Date.now()));
  }

  function setRepeat(key: string) {
    const [every, unit] = key.split(" ");
    change({ repeat: key ? { every: Number(every), unit: unit as "day" | "week" | "month" | "year" } : null });
  }

  function setFocus(on: boolean) {
    const taken = data.items.filter((item) => item.focusOn === data.today && item.kind === "todo" && item.id !== id).length;
    if (on && taken >= FOCUS_SLOTS) toast("Today's three are full. Finish or remove one first");
    else change({ focusOn: on ? data.today : null });
  }

  function addStep(event: SubmitEvent) {
    event.preventDefault();
    if (!draft || !newStep.trim()) return;
    change({ subtasks: [...draft.subtasks, { id: newId(), text: newStep.trim(), done: false }] });
    newStep = "";
  }

  function close() {
    save();
    ui.editId = null;
    // An item with its text deleted is an item deleted.
    if (draft && original && !draft.text.trim()) void remove(original);
  }

  function finish(action: (item: Item) => Promise<void>) {
    if (!draft) return;
    save();
    ui.editId = null;
    void action($state.snapshot(draft));
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Edit item">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={close}><Icon name="back" /></button>
    <h2>{KINDS.find((entry) => entry.kind === draft?.kind)?.label ?? "Item"}</h2>
    <button class="done" onclick={close}>Done</button>
  </div>

  {#if draft}
    <div class="sheet-body">
      {#if !isOpen(draft)}
        <div class="banner plain" style="margin:0 0 12px">
          <p>{draft.kind === "shopping" ? "Bought" : "Completed"} {formatDate(localDate(draft.doneAt ?? 0), data.today)}</p>
          <button class="btn small" onclick={() => finish(reopen)}>Restore</button>
        </div>
      {/if}

      <div class="card">
        <textarea
          class="text"
          class:tall={draft.kind === "note"}
          bind:value={draft.text}
          oninput={touch}
          onblur={save}
          placeholder={draft.kind === "note" ? "Note" : "What is it?"}
          aria-label="Text"
        ></textarea>
      </div>

      <div class="card" style="margin-top:12px">
        <div class="field stack">
          <div class="seg" role="group" aria-label="Kind">
            {#each KINDS as { kind, label } (kind)}
              <button aria-pressed={draft.kind === kind} onclick={() => setKind(kind)}>{label}</button>
            {/each}
          </div>
        </div>
        <label class="field">
          <span class="label">List</span>
          <select class="grow" value={draft.listId} onchange={(event) => change({ listId: event.currentTarget.value })}>
            {#each lists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
          </select>
        </label>

        {#if draft.kind === "todo"}
          <div class="field stack">
            <label class="field" style="padding:0;min-height:0">
              <span class="label">Due</span>
              <input
                class="grow"
                type="date"
                value={draft.due ?? ""}
                onchange={(event) => change({ due: event.currentTarget.value || null })}
              />
            </label>
            <div class="chips" style="padding-left:96px">
              <button class="chip" aria-pressed={draft.due === data.today} onclick={() => change({ due: data.today })}>Today</button>
              <button
                class="chip"
                aria-pressed={draft.due === addDays(data.today, 1)}
                onclick={() => change({ due: addDays(data.today, 1) })}>Tomorrow</button
              >
              {#if draft.due}<button class="chip" onclick={() => change({ due: null })}>No date</button>{/if}
            </div>
          </div>
          <label class="field">
            <span class="label">Repeat</span>
            <select class="grow" value={repeatKey} onchange={(event) => setRepeat(event.currentTarget.value)}>
              {#each REPEATS as [key, label] (key)}<option value={key}>{label}</option>{/each}
              {#if draft.repeat && !REPEATS.some(([key]) => key === repeatKey)}
                <option value={repeatKey}>Every {draft.repeat.every} {draft.repeat.unit}s</option>
              {/if}
            </select>
          </label>
          <div class="field">
            <span class="label">Priority</span>
            <div class="seg grow" role="group" aria-label="Priority">
              {#each PRIORITIES as label, level (label)}
                <button aria-pressed={draft.priority === level} onclick={() => change({ priority: level as Priority })}>{label}</button>
              {/each}
            </div>
          </div>
          {#if isOpen(draft)}
            <div class="field">
              <span class="grow">One of today's three</span>
              <button class="switch" role="switch" aria-checked={focused} aria-label="One of today's three" onclick={() => setFocus(!focused)}
              ></button>
            </div>
          {/if}
        {/if}

        {#if draft.kind === "shopping"}
          <label class="field">
            <span class="label">Section</span>
            <select class="grow" value={draft.section ?? "Other"} onchange={(event) => change({ section: event.currentTarget.value })}>
              {#each sections as section (section)}<option value={section}>{section}</option>{/each}
            </select>
          </label>
          <div class="field">
            <span class="grow">
              Staple
              <span class="muted small" style="display:block">Stays on the list after buying, ready to restock</span>
            </span>
            <button class="switch" role="switch" aria-checked={draft.staple} aria-label="Staple" onclick={() => change({ staple: !draft!.staple })}
            ></button>
          </div>
        {/if}

        {#if draft.kind === "note"}
          <div class="field">
            <span class="grow">Pinned</span>
            <button class="switch" role="switch" aria-checked={draft.pinned} aria-label="Pinned" onclick={() => change({ pinned: !draft!.pinned })}
            ></button>
          </div>
        {/if}

        <label class="field">
          <span class="label">Tags</span>
          <input
            class="grow"
            type="text"
            autocapitalize="none"
            autocomplete="off"
            placeholder="home urgent"
            bind:value={tagText}
            onchange={() => change({ tags: parseTags(tagText) })}
          />
        </label>
      </div>

      {#if draft.kind === "todo"}
        <div class="section-head"><h2>Steps</h2></div>
        <div class="card">
          <div class="steps" style="padding:4px 8px">
            {#each draft.subtasks as step (step.id)}
              <div class="step" class:is-done={step.done}>
                <button
                  class="check"
                  role="checkbox"
                  aria-checked={step.done}
                  aria-label="Step done"
                  onclick={() => {
                    step.done = !step.done;
                    change({});
                  }}
                >
                  <span class="row"><span class="box" class:on={step.done} style="width:22px;height:22px"><Icon name="check" size={14} /></span></span>
                </button>
                <input type="text" bind:value={step.text} oninput={touch} onblur={save} aria-label="Step" />
                <button
                  class="side"
                  aria-label="Remove step"
                  onclick={() => change({ subtasks: draft!.subtasks.filter((other) => other.id !== step.id) })}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            {/each}
            <form class="step" onsubmit={addStep}>
              <span class="check"><Icon name="plus" size={18} /></span>
              <input type="text" bind:value={newStep} placeholder="Add a step" enterkeyhint="done" aria-label="New step" />
            </form>
          </div>
        </div>
      {/if}

      {#if draft.kind === "todo" && isOpen(draft)}
        <button
          class="btn"
          style="width:100%;margin-top:20px"
          onclick={() => {
            const item = $state.snapshot(draft)!;
            close();
            startTimer("todo", item.id, title(item), 25);
          }}
        >
          <Icon name="timer" size={18} />Focus on this for 25 minutes
        </button>
      {/if}

      <div style="display:flex;gap:8px;margin-top:12px">
        {#if isOpen(draft) && draft.kind !== "note"}
          <button class="btn primary" style="flex:1" onclick={() => finish(complete)}>
            <Icon name="check" size={18} />{draft.kind === "shopping" ? "Got it" : "Complete"}
          </button>
        {/if}
        <button class="btn danger" style="flex:1" onclick={() => finish(remove)}><Icon name="trash" size={18} />Delete</button>
      </div>
      <p class="muted small" style="text-align:center;margin-top:16px">
        Added {formatDate(localDate(draft.createdAt), data.today)}
      </p>
    </div>
  {:else}
    <p class="empty">This item no longer exists.</p>
  {/if}
</div>
