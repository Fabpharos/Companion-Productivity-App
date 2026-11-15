<script lang="ts">
  // The shell: a header, the capture box, the current screen, and five tabs.
  import { formatDate, weekdayName } from "./lib/dates.ts";
  import Archive from "./screens/Archive.svelte";
  import Lists from "./screens/Lists.svelte";
  import ListView from "./screens/ListView.svelte";
  import Search from "./screens/Search.svelte";
  import Settings from "./screens/Settings.svelte";
  import Today from "./screens/Today.svelte";
  import { currentHash, data, TABS, ui, undoToast, type Tab } from "./state.svelte.ts";
  import CaptureBar from "./ui/CaptureBar.svelte";
  import Icon from "./ui/Icon.svelte";
  import ItemEditor from "./ui/ItemEditor.svelte";

  const LABELS: Record<Tab, string> = { today: "Today", lists: "Lists", chores: "Chores", trips: "Trips", companion: "Companion" };
  const COMING: Partial<Record<Tab, { phase: number; text: string }>> = {
    chores: { phase: 2, text: "Chores that track how overdue they are, with points, streaks and quests." },
    trips: { phase: 3, text: "Packing lists, itineraries, budgets and phrase cards for each trip, starting with Japan." },
    companion: { phase: 2, text: "A companion who reacts as things get done, and grows with you." },
  };

  const list = $derived(ui.tab === "lists" ? data.list(ui.listId) : undefined);
  const coming = $derived(COMING[ui.tab]);

  $effect(() => {
    // The address follows the screen without adding history, so there is no back stack to fall out of the app through.
    history.replaceState(null, "", currentHash());
  });

  $effect(() => {
    const { theme } = data.settings;
    if (!data.ready) return;
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  });

  $effect(() => {
    // The status bar area takes the page colour in both themes.
    void data.settings.theme;
    const colour = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colour);
  });
</script>

<div class="shell">
  <header class="top">
    {#if list}
      <button class="icon-btn" style="margin-left:-12px" aria-label="All lists" onclick={() => ui.go("lists")}><Icon name="back" /></button>
      <h1>{list.name}</h1>
    {:else if ui.tab === "today"}
      <h1>{weekdayName(data.today)}<span class="sub">{formatDate(data.today, data.today).slice(5)}</span></h1>
    {:else}
      <h1>{LABELS[ui.tab]}</h1>
    {/if}
    <button class="icon-btn" aria-label="Search" onclick={() => (ui.overlay = "search")}><Icon name="search" /></button>
    <button class="icon-btn" aria-label="Settings" onclick={() => (ui.overlay = "settings")}><Icon name="settings" /></button>
  </header>

  <CaptureBar {list} />

  <main class="scroll">
    {#if !data.ready}
      <!-- The database opens in a few milliseconds. Nothing is drawn until it has, so no empty state flashes. -->
    {:else if ui.tab === "today"}
      <Today />
    {:else if ui.tab === "lists"}
      {#if list}
        {#key list.id}<ListView {list} />{/key}
      {:else}
        <Lists />
      {/if}
    {:else if coming}
      <div class="placeholder">
        <span class="glyph"><Icon name={ui.tab} size={34} /></span>
        <h2>{LABELS[ui.tab]} arrive in Phase {coming.phase}</h2>
        <p>{coming.text}</p>
        <p class="small">The capture box above already works from here.</p>
      </div>
    {/if}
  </main>

  <nav class="tabs" aria-label="Sections">
    {#each TABS as tab (tab)}
      <button aria-current={ui.tab === tab ? "page" : undefined} onclick={() => ui.go(tab)}>
        <Icon name={tab} size={24} />
        {LABELS[tab]}
      </button>
    {/each}
  </nav>
</div>

{#if ui.overlay === "search"}<Search />{/if}
{#if ui.overlay === "settings"}<Settings />{/if}
{#if ui.overlay === "archive"}<Archive />{/if}
{#if ui.editId}
  {#key ui.editId}<ItemEditor id={ui.editId} />{/key}
{/if}

{#if ui.toast}
  <div class="toast" role="status">
    <span>{ui.toast.message}</span>
    {#if ui.toast.undo}<button onclick={undoToast}>Undo</button>{/if}
  </div>
{/if}
