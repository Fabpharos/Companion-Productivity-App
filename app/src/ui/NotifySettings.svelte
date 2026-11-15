<script lang="ts">
  // Notifications: connecting this phone to the Worker, and choosing what arrives and when.
  import { formatDate, formatTime, isTime, localDate } from "../lib/dates.ts";
  import type { NotifyKind, NotifySettings } from "../lib/model.ts";
  import { isStandalone, pushSupported } from "../push.ts";
  import { data, disableNotifications, enableNotifications, setNotify, testNotification, toast, ui } from "../state.svelte.ts";

  const KINDS: { kind: NotifyKind; label: string; detail: string }[] = [
    { kind: "task", label: "Task reminders", detail: "At the time set on a to-do" },
    { kind: "morning", label: "Morning summary", detail: "What is due, and the trip countdown" },
    { kind: "chore", label: "Chore nudges", detail: "Once, the day a chore goes past due" },
    { kind: "streak", label: "Streak saver", detail: "In the evening, only when the streak is at stake" },
    { kind: "trip", label: "Trip tasks", detail: "Tasks before leaving, the day they are due" },
    { kind: "backup", label: "Backup reminder", detail: "Two weeks after the last backup" },
  ];
  const TIMES: { key: "morningAt" | "eveningAt" | "quietFrom" | "quietTo"; label: string }[] = [
    { key: "morningAt", label: "Morning summary at" },
    { key: "eveningAt", label: "Streak saver at" },
    { key: "quietFrom", label: "Quiet from" },
    { key: "quietTo", label: "Quiet until" },
  ];

  // svelte-ignore state_referenced_locally
  let url = $state(data.connection.url);
  // svelte-ignore state_referenced_locally
  let key = $state(data.connection.key);
  let busy = $state(false);
  let error = $state("");

  const notify = $derived(data.settings.notify);
  const on = $derived(data.connection.on);
  const upcoming = $derived(data.plan.filter((entry) => entry.at > data.now));
  const coming = $derived(upcoming.slice(0, 5));

  const available = pushSupported();
  const hint = available
    ? ""
    : isStandalone()
      ? "This phone does not offer notifications to web apps. They need iOS 16.4 or later."
      : "Notifications only work in the app opened from its Home Screen icon, not in a browser tab.";

  async function run(action: () => Promise<string | null>, done?: string) {
    busy = true;
    error = "";
    error = (await action()) ?? "";
    if (!error && done) toast(done);
    busy = false;
  }

  function setKind(kind: NotifyKind, value: boolean) {
    setNotify({ kinds: { ...notify.kinds, [kind]: value } });
  }

  function setTime(field: keyof NotifySettings, value: string) {
    if (isTime(value)) setNotify({ [field]: value });
  }

  /** "Today 5:00 PM", "Thu, Nov 19 8:00 AM". */
  function describeAt(at: number): string {
    const day = localDate(at);
    const date = new Date(at);
    const time = formatTime(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
    return `${day === data.today ? "Today" : formatDate(day, data.today)} ${time}`;
  }
</script>

<div class="section-head"><h2>Notifications</h2></div>
<div class="card">
  {#if !on}
    <div class="field stack">
      <p class="muted small">
        A web app on iPhone cannot send itself a reminder later, so a small Worker does it. It is given only the time and
        the text of each notification. Enter its address and key once.
      </p>
      <input class="input" type="url" inputmode="url" autocapitalize="none" autocomplete="off" placeholder="https://…workers.dev" aria-label="Worker address" bind:value={url} />
      <input class="input" type="password" autocomplete="off" placeholder="App key" aria-label="App key" bind:value={key} />
      <button class="btn primary" disabled={busy || !available || !url.trim() || !key.trim()} onclick={() => run(() => enableNotifications(url, key), "Notifications are on")}>
        Turn on notifications
      </button>
      {#if hint}<p class="muted small">{hint}</p>{/if}
      {#if error}<p class="small" style="color:var(--bad)" role="alert">{error}</p>{/if}
    </div>
  {:else}
    <div class="field">
      <span class="grow">
        On
        <span class="muted small" style="display:block">
          {#if ui.sync.state === "error"}
            <span style="color:var(--bad)">{ui.sync.message}</span>
          {:else}
            {upcoming.length} scheduled for the next two weeks
          {/if}
        </span>
      </span>
      <button class="btn small" disabled={busy} onclick={() => run(async () => (await disableNotifications(), null), "Notifications are off")}>Turn off</button>
    </div>
    <div class="field stack">
      <div style="display:flex;gap:8px">
        <button class="btn small" style="flex:1" disabled={busy} onclick={() => run(() => testNotification(0), "Test sent")}>Send a test</button>
        <button class="btn small" style="flex:1" disabled={busy} onclick={() => run(() => testNotification(60), "Test arrives in a minute. Close the app to see it")}>
          Test in 1 minute
        </button>
      </div>
      {#if error}<p class="small" style="color:var(--bad)" role="alert">{error}</p>{/if}
    </div>
  {/if}
</div>

{#if on}
  <div class="card" style="margin-top:12px">
    {#each KINDS as { kind, label, detail } (kind)}
      <div class="field">
        <span class="grow">
          {label}
          <span class="muted small" style="display:block">{detail}</span>
        </span>
        <button class="switch" role="switch" aria-checked={notify.kinds[kind]} aria-label={label} onclick={() => setKind(kind, !notify.kinds[kind])}></button>
      </div>
    {/each}
  </div>

  <div class="card" style="margin-top:12px">
    {#each TIMES as { key: field, label } (field)}
      <label class="field">
        <span class="grow">{label}</span>
        <input class="input" style="width:auto" type="time" value={notify[field]} onchange={(event) => setTime(field, event.currentTarget.value)} />
      </label>
    {/each}
    <p class="muted small" style="padding:0 14px 10px">Anything that falls in the quiet hours waits until they end.</p>
    <label class="field">
      <span class="grow">
        Nudges a day, at most
        <span class="muted small" style="display:block">Task reminders and the morning summary always arrive</span>
      </span>
      <select style="width:auto" value={String(notify.dailyCap)} onchange={(event) => setNotify({ dailyCap: Number(event.currentTarget.value) })}>
        {#each [0, 1, 2, 3, 4, 5] as cap (cap)}<option value={String(cap)}>{cap}</option>{/each}
      </select>
    </label>
    <div class="field">
      <span class="grow">
        Hide the text
        <span class="muted small" style="display:block">Every notification reads "You have a reminder", so no wording leaves the phone</span>
      </span>
      <button class="switch" role="switch" aria-checked={notify.privateText} aria-label="Hide the text" onclick={() => setNotify({ privateText: !notify.privateText })}
      ></button>
    </div>
  </div>

  <div class="section-head"><h2>Coming up</h2></div>
  <div class="card">
    {#each coming as entry (entry.id)}
      <div class="field">
        <span class="grow">
          {entry.title}
          <span class="muted small" style="display:block">{entry.body}</span>
        </span>
        <span class="muted small" style="flex:none;text-align:right">{describeAt(entry.at)}</span>
      </div>
    {:else}
      <p class="empty">Nothing is scheduled.</p>
    {/each}
  </div>
{/if}
