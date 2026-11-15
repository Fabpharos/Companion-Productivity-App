<script lang="ts">
  import { deliver } from "../files.ts";
  import { BackupError, backupFileName, readBackup } from "../lib/backup.ts";
  import { formatDate, localDate } from "../lib/dates.ts";
  import type { Theme } from "../lib/model.ts";
  import { actions, data, setTheme, toast, ui } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";

  const THEMES: { theme: Theme; label: string }[] = [
    { theme: "system", label: "Match phone" },
    { theme: "light", label: "Light" },
    { theme: "dark", label: "Dark" },
  ];

  let busy = $state(false);
  let error = $state("");
  /** A backup file that has been read and is waiting for the go-ahead to replace everything. */
  let pending = $state<{ text: string; items: number; made: string } | null>(null);
  let persisted = $state<boolean | null>(null);

  void navigator.storage?.persisted?.().then((value) => (persisted = value));

  const lastBackup = $derived(
    data.settings.lastBackupAt ? formatDate(localDate(data.settings.lastBackupAt), data.today) : "Never",
  );

  async function exportNow() {
    busy = true;
    error = "";
    try {
      if (await deliver(await actions.exportBackup(), backupFileName(Date.now()), "application/json")) {
        await actions.markBackedUp();
        toast("Backup file created");
      }
    } catch (reason) {
      error = `The backup could not be created: ${reason instanceof Error ? reason.message : reason}`;
    } finally {
      busy = false;
    }
  }

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    error = "";
    pending = null;
    try {
      const text = await file.text();
      const { snapshot, exportedAt } = readBackup(text, Date.now());
      pending = { text, items: snapshot.items.length, made: formatDate(localDate(exportedAt), data.today) };
    } catch (reason) {
      error = reason instanceof BackupError ? reason.message : "That file could not be read.";
    }
  }

  async function restore() {
    if (!pending) return;
    busy = true;
    try {
      const { items } = await actions.importBackup(pending.text);
      toast(`Restored ${items} ${items === 1 ? "item" : "items"}`);
    } catch (reason) {
      error = reason instanceof BackupError ? reason.message : "The backup could not be restored. Nothing was changed.";
    } finally {
      pending = null;
      busy = false;
    }
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={() => (ui.overlay = null)}><Icon name="back" /></button>
    <h2>Settings</h2>
  </div>
  <div class="sheet-body">
    <div class="section-head"><h2>Theme</h2></div>
    <div class="seg" role="group" aria-label="Theme">
      {#each THEMES as { theme, label } (theme)}
        <button aria-pressed={data.settings.theme === theme} onclick={() => setTheme(theme)}>{label}</button>
      {/each}
    </div>

    <div class="section-head"><h2>Backup</h2></div>
    <div class="card">
      <div class="field">
        <span class="grow">Last backup</span>
        <span class="muted">{lastBackup}</span>
      </div>
      <div class="field stack">
        <p class="muted small">
          Everything lives only on this phone. A backup is one file holding all of it. Save it to Files or iCloud Drive, and
          the app will remind you every two weeks.
        </p>
        <button class="btn primary" disabled={busy} onclick={exportNow}>Back up now</button>
        <label class="btn" aria-disabled={busy}>
          Restore from a backup file
          <input type="file" accept=".json,application/json,text/plain" hidden disabled={busy} onchange={choose} />
        </label>
        {#if pending}
          <div class="banner" style="margin:0" role="alert">
            <p>
              Replace everything on this phone with the backup from {pending.made} ({pending.items}
              {pending.items === 1 ? "item" : "items"})? What is here now will be lost.
            </p>
            <button class="btn small" onclick={() => (pending = null)}>Cancel</button>
            <button class="btn small danger" disabled={busy} onclick={restore}>Replace</button>
          </div>
        {/if}
        {#if error}<p class="small" style="color:var(--bad)" role="alert">{error}</p>{/if}
      </div>
    </div>

    <div class="section-head"><h2>Storage</h2></div>
    <div class="card">
      <div class="field">
        <span class="grow">Items stored</span>
        <span class="muted">{data.items.length}</span>
      </div>
      <div class="field">
        <span class="grow">
          Protected from clearing
          <span class="muted small" style="display:block">
            {persisted
              ? "The phone will not clear this data to free up space."
              : "Open the app from its Home Screen icon so the phone keeps its data."}
          </span>
        </span>
        <span class="muted">{persisted === null ? "" : persisted ? "Yes" : "No"}</span>
      </div>
    </div>

    <p class="muted small" style="text-align:center;margin-top:24px">
      Companion · built {formatDate(localDate(new Date(__BUILD_TIME__)), data.today)}
    </p>
  </div>
</div>
