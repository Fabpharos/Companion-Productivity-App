<script lang="ts">
  // One trip. The chips across the top switch between its parts; each part
  // is a plain list with an add box at the end.
  import { deliver } from "../files.ts";
  import { describeDue, formatDate, localDate } from "../lib/dates.ts";
  import { makeCalendar } from "../lib/ics.ts";
  import type { Trip, TripEntry } from "../lib/model.ts";
  import {
    byCategory,
    countdown,
    formatMoney,
    itinerary,
    mapLink,
    ofKind,
    parseAmount,
    spending,
    tasksView,
    toHome,
    toLocal,
    type ItineraryDay,
  } from "../lib/trips.ts";
  import { actions, data, removeTrip, toast, toggleEntry, TRIP_SECTIONS, ui, type TripSection } from "../state.svelte.ts";
  import AddRow from "../ui/AddRow.svelte";
  import Icon from "../ui/Icon.svelte";

  let { trip }: { trip: Trip } = $props();

  const LABELS: Record<TripSection, string> = {
    overview: "Overview",
    packing: "Packing",
    tasks: "Before I leave",
    itinerary: "Itinerary",
    wishes: "Wish-list",
    budget: "Budget",
    phrases: "Phrases",
    souvenirs: "Souvenirs",
    journal: "Journal",
  };

  const entries = $derived(data.tripEntries.filter((entry) => entry.tripId === trip.id));
  const count = $derived(countdown(trip, data.today));
  const packing = $derived(byCategory(entries, trip.id, "packing"));
  const packed = $derived(ofKind(entries, trip.id, "packing"));
  const tasks = $derived(tasksView(trip, entries, data.today));
  const days = $derived(itinerary(trip, entries));
  const wishes = $derived(ofKind(entries, trip.id, "wish"));
  const expenses = $derived(ofKind(entries, trip.id, "expense").reverse());
  const spent = $derived(spending(trip, entries));
  const phrases = $derived(byCategory(entries, trip.id, "phrase"));
  const souvenirs = $derived(ofKind(entries, trip.id, "souvenir"));
  const journal = $derived(ofKind(entries, trip.id, "journal").sort((a, b) => ((a.day ?? "") < (b.day ?? "") ? 1 : -1)));
  const local = $derived(trip.localCurrency || trip.homeCurrency);
  const twoCurrencies = $derived(Boolean(trip.localCurrency) && trip.localCurrency !== trip.homeCurrency);

  const add = (kind: TripEntry["kind"], fields: Partial<TripEntry> = {}) => (text: string) => actions.addEntry(trip.id, kind, text, fields);
  const save = (fields: Partial<Trip>) => actions.saveTrip({ ...trip, ...fields });
  const open = (entry: TripEntry) => (ui.entryId = entry.id);

  // Packing: a new category starts with its first item.
  let newCategory = $state("");

  // Tasks
  let taskDays = $state("7");

  // Budget
  let expenseText = $state("");
  let expenseAmount = $state("");
  let convertLocal = $state("");
  let convertHome = $state("");
  let rateBusy = $state(false);
  let rateError = $state("");

  async function addExpense(event: SubmitEvent) {
    event.preventDefault();
    const amount = parseAmount(expenseAmount);
    if (!expenseText.trim() || amount === null) return;
    await actions.addEntry(trip.id, "expense", expenseText, { amount, day: data.today });
    expenseText = "";
    expenseAmount = "";
  }

  async function refreshRate() {
    rateBusy = true;
    rateError = "";
    try {
      await actions.updateRate(trip);
    } catch (reason) {
      rateError = reason instanceof Error ? reason.message : "The rate could not be fetched.";
    } finally {
      rateBusy = false;
    }
  }

  const round = (value: number | null) => (value === null ? "" : String(Math.round(value * 100) / 100));

  // Phrases: the card being shown large.
  let showing = $state<TripEntry | null>(null);
  let phraseText = $state("");
  let phraseMeaning = $state("");

  async function addPhrase(event: SubmitEvent) {
    event.preventDefault();
    if (!phraseText.trim()) return;
    await actions.addEntry(trip.id, "phrase", phraseText, { meaning: phraseMeaning.trim() || null, category: "Mine" });
    phraseText = "";
    phraseMeaning = "";
  }

  // Souvenirs
  let souvenirFor = $state("");

  async function exportDay(day: ItineraryDay) {
    const events = day.stops.map((stop) => ({
      uid: stop.id,
      title: stop.text,
      date: day.day,
      time: stop.time,
      location: stop.place,
      notes: stop.note,
    }));
    const name = `${trip.name} ${day.number ? `day ${day.number}` : day.day}.ics`.replace(/[^\w.-]+/g, "-");
    if (await deliver(makeCalendar(events, Date.now()), name, "text/calendar")) toast("Calendar file created");
  }
</script>

{#snippet tick(entry: TripEntry)}
  <button class="check" role="checkbox" aria-checked={entry.done} aria-label={entry.done ? "Untick" : "Tick"} onclick={() => toggleEntry(entry)}>
    <span class="box" class:on={entry.done}><Icon name="check" size={16} /></span>
  </button>
{/snippet}

{#snippet stopRow(stop: TripEntry)}
  <div class="row">
    <button class="body" onclick={() => open(stop)}>
      <span class="title">{#if stop.time}<span class="time">{stop.time}</span>{/if}{stop.text}</span>
      {#if stop.place || stop.note}<span class="preview">{[stop.place, stop.note].filter(Boolean).join(" · ")}</span>{/if}
    </button>
    <a class="side on" style="color:var(--accent)" href={mapLink(stop)} target="_blank" rel="noopener" aria-label="Open {stop.text} in Maps">
      <Icon name="trips" size={20} />
    </a>
  </div>
{/snippet}

<div class="section-tabs" role="group" aria-label="Parts of the trip">
  {#each TRIP_SECTIONS as section (section)}
    <button class="chip" aria-pressed={ui.tripSection === section} onclick={() => (ui.tripSection = section)}>
      {LABELS[section]}
    </button>
  {/each}
</div>

{#if ui.tripSection === "overview"}
  <div class="trip-card">
    <strong>{count.phase === "over" ? "This trip has ended" : count.text.charAt(0).toUpperCase() + count.text.slice(1)}</strong>
    <span>{formatDate(trip.start, data.today)} to {formatDate(trip.end, data.today)}{trip.destination ? ` · ${trip.destination}` : ""}</span>
  </div>

  <div class="card" style="margin-top:12px">
    <button class="nav-row" onclick={() => (ui.tripSection = "packing")}>
      <span class="name">Packing</span><span class="count">{packed.filter((e) => e.done).length}/{packed.length}</span>
    </button>
    <button class="nav-row" onclick={() => (ui.tripSection = "tasks")}>
      <span class="name">Before I leave</span>
      <span class="count" style:color={tasks.some((row) => row.late) ? "var(--bad)" : undefined}>
        {tasks.filter((row) => row.entry.done).length}/{tasks.length}
      </span>
    </button>
    <button class="nav-row" onclick={() => (ui.tripSection = "itinerary")}>
      <span class="name">Itinerary</span><span class="count">{days.reduce((sum, day) => sum + day.stops.length, 0)} stops</span>
    </button>
    <button class="nav-row" onclick={() => (ui.tripSection = "budget")}>
      <span class="name">Spent</span><span class="count">{formatMoney(spent.local, local)}</span>
    </button>
  </div>

  <div class="section-head"><h2>Details</h2></div>
  <div class="card">
    <label class="field">
      <span class="label">Name</span>
      <input class="grow" type="text" value={trip.name} onchange={(e) => e.currentTarget.value.trim() && save({ name: e.currentTarget.value.trim() })} />
    </label>
    <label class="field">
      <span class="label">Where</span>
      <input class="grow" type="text" value={trip.destination} onchange={(e) => save({ destination: e.currentTarget.value.trim() })} />
    </label>
    <label class="field">
      <span class="label">Leaves</span>
      <input
        class="grow"
        type="date"
        value={trip.start}
        onchange={async (e) => e.currentTarget.value && toast("Trip moved", await actions.rescheduleTrip(trip, e.currentTarget.value))}
      />
    </label>
    <label class="field">
      <span class="label">Returns</span>
      <input class="grow" type="date" value={trip.end} min={trip.start} onchange={(e) => e.currentTarget.value >= trip.start && save({ end: e.currentTarget.value })} />
    </label>
    <label class="field">
      <span class="label">Outfit</span>
      <input class="grow" type="text" value={trip.outfit} placeholder="What the companion wears, like kimono" autocapitalize="none" onchange={(e) => save({ outfit: e.currentTarget.value.trim().toLowerCase() })} />
    </label>
  </div>
  <p class="muted small" style="margin:8px 4px 0">Changing the leaving date moves the whole trip: its return date, its itinerary and the tasks before leaving all move with it.</p>

  <button class="btn danger" style="width:100%;margin-top:24px" onclick={() => removeTrip(trip)}><Icon name="trash" size={18} />Delete trip</button>
{/if}

{#if ui.tripSection === "packing"}
  <div class="section-head" style="margin-top:8px">
    <h2>{packed.filter((e) => e.done).length} of {packed.length} packed</h2>
  </div>
  {#each packing as group (group.name)}
    <div class="section-head"><h2>{group.name}</h2><span class="count">{group.entries.filter((e) => e.done).length}/{group.entries.length}</span></div>
    <div class="card">
      {#each group.entries as entry (entry.id)}
        <div class="row" class:is-done={entry.done}>
          {@render tick(entry)}
          <button class="body" onclick={() => open(entry)}><span class="title">{entry.text}</span></button>
        </div>
      {/each}
      <AddRow placeholder="Add to {group.name}" onadd={add("packing", { category: group.name })} />
    </div>
  {/each}
  <div class="section-head"><h2>New category</h2></div>
  <div class="card">
    <label class="field">
      <span class="label">Category</span>
      <input class="grow" type="text" bind:value={newCategory} placeholder="Like Camera gear" />
    </label>
    <AddRow placeholder="First item in it" onadd={(text) => (add("packing", { category: newCategory.trim() || "Other" })(text), (newCategory = ""))} />
  </div>
{/if}

{#if ui.tripSection === "tasks"}
  <div class="card" style="margin-top:8px">
    {#each tasks as row (row.entry.id)}
      <div class="row" class:is-done={row.entry.done}>
        {@render tick(row.entry)}
        <button class="body" onclick={() => open(row.entry)}>
          <span class="title">{row.entry.text}</span>
          <span class="meta">
            <span class:late={row.late}>{describeDue(row.due, data.today)}</span>
            <span>{row.entry.daysBefore ? `${row.entry.daysBefore} days before` : "on the day"}</span>
          </span>
        </button>
      </div>
    {:else}
      <p class="empty">Nothing to do before leaving yet.</p>
    {/each}
  </div>
  <div class="section-head"><h2>Add a task</h2></div>
  <div class="card">
    <label class="field">
      <span class="label">Due</span>
      <input type="number" inputmode="numeric" min="0" bind:value={taskDays} />
      <span class="grow muted small">days before leaving</span>
    </label>
    <AddRow placeholder="Something to do before the trip" onadd={add("task", { daysBefore: Math.max(0, Math.floor(Number(taskDays) || 0)) })} />
  </div>
{/if}

{#if ui.tripSection === "itinerary"}
  {#each days as day (day.day)}
    <div class="section-head">
      <h2 style:color={day.day === data.today ? "var(--accent)" : undefined}>
        {day.number ? `Day ${day.number} · ` : ""}{formatDate(day.day, data.today)}{day.day === data.today ? " · today" : ""}
      </h2>
      {#if day.stops.length}
        <button class="link" onclick={() => exportDay(day)} aria-label="Add {formatDate(day.day, data.today)} to the calendar">To calendar</button>
      {/if}
    </div>
    <div class="card">
      {#each day.stops as stop (stop.id)}{@render stopRow(stop)}{/each}
      <AddRow placeholder="Add a stop" onadd={add("stop", { day: day.day })} />
    </div>
  {/each}
  <p class="muted small" style="margin:12px 4px 0">Tap a stop to set its time and place, or to move it to another day.</p>
{/if}

{#if ui.tripSection === "wishes"}
  <div class="card" style="margin-top:8px">
    {#each wishes as wish (wish.id)}{@render stopRow(wish)}{/each}
    <AddRow placeholder="A place or thing to fit in somewhere" onadd={add("wish")} />
  </div>
  <p class="muted small" style="margin:8px 4px 0">Tap a wish and pick a day to move it onto the itinerary.</p>
{/if}

{#if ui.tripSection === "budget"}
  <div class="stats" style="margin-top:8px">
    <div class="stat">
      <div class="value">{formatMoney(spent.local, local)}</div>
      <div class="label">spent{twoCurrencies && spent.home !== null ? ` · ${formatMoney(spent.home, trip.homeCurrency)}` : ""}</div>
    </div>
    <div class="stat">
      <div class="value" style:color={spent.left !== null && spent.left < 0 ? "var(--bad)" : undefined}>
        {spent.left === null ? "–" : formatMoney(Math.abs(spent.left), trip.homeCurrency)}
      </div>
      <div class="label">{spent.left === null ? (trip.budget ? "needs a rate" : "no budget set") : spent.left < 0 ? "over budget" : "left"}</div>
    </div>
  </div>

  <div class="section-head"><h2>Add an expense</h2></div>
  <form class="card" onsubmit={addExpense}>
    <div class="field">
      <input class="grow" type="text" bind:value={expenseText} placeholder="What it was" aria-label="Expense" />
      <input type="text" inputmode="decimal" bind:value={expenseAmount} placeholder={local} aria-label="Amount in {local}" style="width:96px" />
      <button class="btn small primary" type="submit" disabled={!expenseText.trim() || parseAmount(expenseAmount) === null}>Add</button>
    </div>
  </form>

  {#if expenses.length}
    <div class="card" style="margin-top:12px">
      {#each expenses as expense (expense.id)}
        {@const home = twoCurrencies ? toHome(expense.amount ?? 0, trip.rate) : null}
        <div class="row">
          <button class="body" onclick={() => open(expense)}>
            <span class="title">{expense.text}</span>
            <span class="meta"><span>{expense.day ? formatDate(expense.day, data.today) : ""}</span></span>
          </button>
          <span class="amount">
            {formatMoney(expense.amount ?? 0, local)}
            {#if home !== null}<small>{formatMoney(home, trip.homeCurrency)}</small>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="section-head"><h2>Money</h2></div>
  <div class="card">
    <label class="field">
      <span class="label">Budget</span>
      <input class="grow" type="text" inputmode="decimal" value={trip.budget ?? ""} placeholder="None" onchange={(e) => save({ budget: parseAmount(e.currentTarget.value) })} />
      <span class="muted">{trip.homeCurrency}</span>
    </label>
    <div class="field">
      <span class="label">Currencies</span>
      <input type="text" value={trip.homeCurrency} maxlength="3" autocapitalize="characters" aria-label="Home currency" style="width:72px"
        onchange={(e) => /^[A-Za-z]{3}$/.test(e.currentTarget.value) && save({ homeCurrency: e.currentTarget.value.toUpperCase(), rate: null, rateAt: null })} />
      <span class="muted">to</span>
      <input type="text" value={trip.localCurrency} maxlength="3" autocapitalize="characters" aria-label="Local currency" placeholder="Same" style="width:72px"
        onchange={(e) => /^([A-Za-z]{3})?$/.test(e.currentTarget.value) && save({ localCurrency: e.currentTarget.value.toUpperCase(), rate: null, rateAt: null })} />
    </div>
    {#if twoCurrencies}
      <div class="field stack">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="grow">
            {#if trip.rate}
              1 {trip.homeCurrency} = {round(trip.rate)} {trip.localCurrency}
              <span class="muted small" style="display:block">{trip.rateAt ? `Saved ${formatDate(localDate(trip.rateAt), data.today)}. Works offline.` : "Typed in"}</span>
            {:else}
              No exchange rate yet
            {/if}
          </span>
          <button class="btn small" disabled={rateBusy} onclick={refreshRate}>{rateBusy ? "Fetching" : "Update rate"}</button>
        </div>
        <label class="field" style="padding:0;min-height:0">
          <span class="label">Or type it</span>
          <input class="grow" type="text" inputmode="decimal" value={trip.rate ?? ""} placeholder="{trip.localCurrency} per 1 {trip.homeCurrency}"
            onchange={(e) => save({ rate: parseAmount(e.currentTarget.value), rateAt: null })} />
        </label>
        {#if rateError}<p class="small" style="color:var(--bad)" role="alert">{rateError}</p>{/if}
      </div>
    {/if}
  </div>

  {#if twoCurrencies && trip.rate}
    <div class="section-head"><h2>Converter</h2></div>
    <div class="card">
      <label class="field">
        <span class="label">{trip.localCurrency}</span>
        <input class="grow" type="text" inputmode="decimal" bind:value={convertLocal} aria-label="Amount in {trip.localCurrency}"
          oninput={() => (convertHome = round(toHome(parseAmount(convertLocal) ?? 0, trip.rate)).replace(/^0$/, ""))} />
      </label>
      <label class="field">
        <span class="label">{trip.homeCurrency}</span>
        <input class="grow" type="text" inputmode="decimal" bind:value={convertHome} aria-label="Amount in {trip.homeCurrency}"
          oninput={() => (convertLocal = round(toLocal(parseAmount(convertHome) ?? 0, trip.rate)).replace(/^0$/, ""))} />
      </label>
    </div>
  {/if}
{/if}

{#if ui.tripSection === "phrases"}
  {#each phrases as group (group.name)}
    <div class="section-head"><h2>{group.name}</h2></div>
    <div class="card">
      {#each group.entries as phrase (phrase.id)}
        <div class="row">
          <button class="body" style="padding-left:16px" onclick={() => (showing = phrase)}>
            <span class="title" lang={trip.localCurrency === "JPY" ? "ja" : undefined}>{phrase.text}</span>
            {#if phrase.meaning}<span class="preview">{phrase.meaning}</span>{/if}
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty"><strong>No phrase cards yet</strong>Add phrases to show to staff, in large text.</p>
  {/each}
  <div class="section-head"><h2>Add a phrase</h2></div>
  <form class="card" onsubmit={addPhrase}>
    <label class="field"><span class="label">Phrase</span><input class="grow" type="text" bind:value={phraseText} placeholder="In the local language" /></label>
    <label class="field"><span class="label">Meaning</span><input class="grow" type="text" bind:value={phraseMeaning} /></label>
    <div class="field"><button class="btn small primary" type="submit" style="margin-left:auto" disabled={!phraseText.trim()}>Add card</button></div>
  </form>
{/if}

{#if ui.tripSection === "souvenirs"}
  <div class="card" style="margin-top:8px">
    {#each souvenirs as entry (entry.id)}
      <div class="row" class:is-done={entry.done}>
        {@render tick(entry)}
        <button class="body" onclick={() => open(entry)}>
          <span class="title">{entry.text}</span>
          {#if entry.forWhom}<span class="meta"><span>for {entry.forWhom}</span></span>{/if}
        </button>
      </div>
    {:else}
      <p class="empty">Things to bring back, and who each one is for.</p>
    {/each}
  </div>
  <div class="section-head"><h2>Add</h2></div>
  <div class="card">
    <label class="field"><span class="label">For</span><input class="grow" type="text" bind:value={souvenirFor} placeholder="Who it is for" /></label>
    <AddRow placeholder="Something to buy" onadd={(text) => (add("souvenir", { forWhom: souvenirFor.trim() || null })(text), (souvenirFor = ""))} />
  </div>
{/if}

{#if ui.tripSection === "journal"}
  <div class="card" style="margin-top:8px">
    <AddRow placeholder="Write about today" onadd={add("journal", { day: data.today })} />
  </div>
  {#each journal as entry (entry.id)}
    <div class="section-head"><h2>{entry.day ? formatDate(entry.day, data.today) : "Undated"}</h2></div>
    <div class="card">
      <button class="nav-row" style="white-space:pre-wrap;align-items:flex-start" onclick={() => open(entry)}><span class="name" style="font-weight:400">{entry.text}</span></button>
    </div>
  {/each}
{/if}

{#if showing}
  <!-- A phrase shown large, to hold up to someone. Tap anywhere to close. -->
  <div class="phrase-card" role="dialog" aria-modal="true" aria-label="Phrase card">
    <button class="face" onclick={() => (showing = null)} aria-label="Close">
      <span class="big" lang={trip.localCurrency === "JPY" ? "ja" : undefined}>{showing.text}</span>
      {#if showing.reading}<span class="reading">{showing.reading}</span>{/if}
      {#if showing.meaning}<span class="meaning">{showing.meaning}</span>{/if}
    </button>
    <button
      class="btn small"
      onclick={() => {
        ui.entryId = showing!.id;
        showing = null;
      }}>Edit</button
    >
  </div>
{/if}
