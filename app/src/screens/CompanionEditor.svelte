<script lang="ts">
  // Who the companion is: its pictures, its name and character, how it
  // speaks, and the character card file that carries all of that.
  // Every change is saved as it is made.
  import { STYLES } from "../../content/styles.ts";
  import type { CompanionCard, PoseName } from "../lib/model.ts";
  import { CLOSE_UP_ASPECT, crop, PORTRAIT_ASPECT } from "../lib/portrait.ts";
  import { companionArt, data, exportCard, importCard, removeImage, resetCompanion, saveCard, setStyle, ui, uploadImage } from "../state.svelte.ts";
  import Icon from "../ui/Icon.svelte";

  const MOODS: { pose: PoseName; label: string }[] = [
    { pose: "happy", label: "Happy" },
    { pose: "proud", label: "Proud" },
    { pose: "sleepy", label: "Sleepy" },
    { pose: "concerned", label: "Concerned" },
  ];
  const TEXTS: { field: "description" | "personality" | "examples"; label: string; hint: string }[] = [
    { field: "description", label: "Description", hint: "Who they are and what they look like" },
    { field: "personality", label: "Personality", hint: "A few words: warm, dry, playful" },
    { field: "examples", label: "Example lines", hint: "Things they would say, one per line" },
  ];

  let busy = $state(false);
  let error = $state("");
  let confirmReset = $state(false);

  const card = $derived(data.card);
  const main = $derived(data.images.find((image) => image.id === "idle"));
  const art = $derived(companionArt());
  const aspect = $derived(main && main.height ? main.width / main.height : PORTRAIT_ASPECT);
  const box = $derived(crop(card.framing, aspect, CLOSE_UP_ASPECT));

  async function run(action: () => Promise<string | null | void>) {
    busy = true;
    error = (await action()) ?? "";
    busy = false;
  }

  function choose(pose: PoseName, event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void run(() => uploadImage(pose, file));
  }

  function chooseCard(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void run(() => importCard(file));
  }

  function setText(field: keyof CompanionCard, event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
    saveCard({ [field]: event.currentTarget.value });
  }

  function setFraming(field: "x" | "y" | "span", event: Event & { currentTarget: HTMLInputElement }) {
    saveCard({ framing: { ...card.framing, [field]: Number(event.currentTarget.value) } });
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Companion">
  <div class="sheet-top">
    <button class="icon-btn" aria-label="Close" onclick={() => (ui.overlay = null)}><Icon name="back" /></button>
    <h2>Companion</h2>
    <button class="done" onclick={() => (ui.overlay = null)}>Done</button>
  </div>
  <div class="sheet-body">
    <div class="section-head"><h2>Picture</h2></div>
    <div class="card">
      <div class="field" style="align-items:flex-start;padding-top:14px;padding-bottom:14px">
        <img class="thumb large" src={art.image("idle")} alt="The companion" />
        <div class="grow" style="display:flex;flex-direction:column;gap:8px">
          <p class="muted small">
            {main
              ? "Your picture is in use."
              : "A tall picture of the whole character works best, with a plain or transparent background."}
          </p>
          <label class="btn small" aria-disabled={busy}>
            {main ? "Change picture" : "Choose a picture"}
            <input type="file" accept="image/*" hidden disabled={busy} onchange={(event) => choose("idle", event)} />
          </label>
          {#if main}
            <button class="btn small" disabled={busy} onclick={() => run(() => removeImage("idle"))}>Use the default art</button>
          {/if}
        </div>
      </div>
    </div>

    {#if main}
      <div class="section-head"><h2>Close-up</h2></div>
      <div class="card">
        <div class="field" style="align-items:center;padding-top:14px;padding-bottom:14px">
          <div class="companion" style="margin:0">
            <div class="portrait" style:aspect-ratio={CLOSE_UP_ASPECT}>
              <img src={main.data} alt="" style:width="{box.width}%" style:left="{box.left}%" style:top="{box.top}%" />
            </div>
          </div>
          <div class="grow" style="display:flex;flex-direction:column;gap:6px">
            <label class="slider">
              <span>Left · right</span>
              <input type="range" min="0" max="1" step="0.01" value={card.framing.x} oninput={(event) => setFraming("x", event)} />
            </label>
            <label class="slider">
              <span>Up · down</span>
              <input type="range" min="0" max="1" step="0.01" value={card.framing.y} oninput={(event) => setFraming("y", event)} />
            </label>
            <label class="slider">
              <span>Closer · wider</span>
              <input type="range" min="0.1" max="1" step="0.01" value={card.framing.span} oninput={(event) => setFraming("span", event)} />
            </label>
          </div>
        </div>
        <p class="muted small" style="padding:0 14px 12px">This is how the face is framed beside what the companion says on Today.</p>
      </div>

      <div class="section-head"><h2>Moods</h2></div>
      <div class="card">
        {#each MOODS as { pose, label } (pose)}
          {@const image = data.images.find((other) => other.id === pose)}
          <div class="field">
            <img class="thumb" src={image?.data ?? main.data} alt="" style:opacity={image ? 1 : 0.35} />
            <span class="grow">
              {label}
              <span class="muted small" style="display:block">{image ? "Has its own picture" : "Uses the main picture"}</span>
            </span>
            {#if image}
              <button class="btn small" disabled={busy} onclick={() => run(() => removeImage(pose))}>Remove</button>
            {:else}
              <label class="btn small" aria-disabled={busy}>
                Choose
                <input type="file" accept="image/*" hidden disabled={busy} onchange={(event) => choose(pose, event)} />
              </label>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="section-head"><h2>Voice</h2></div>
    <div class="card">
      <div class="field stack">
        <div class="chips" role="group" aria-label="Dialogue style">
          {#each STYLES as style (style.id)}
            <button class="chip" aria-pressed={data.style.id === style.id} onclick={() => setStyle(style.id)}>{style.name}</button>
          {/each}
        </div>
        {#if ui.companion.text}<p class="muted" aria-live="polite">“{ui.companion.text}”</p>{/if}
      </div>
    </div>

    <div class="section-head"><h2>Who they are</h2></div>
    <div class="card">
      <label class="field">
        <span class="label">Name</span>
        <input class="grow" type="text" autocomplete="off" placeholder="No name yet" value={card.name} onchange={(event) => setText("name", event)} />
      </label>
      {#each TEXTS as { field, label, hint } (field)}
        <label class="field stack">
          <span class="muted small">{label}</span>
          <textarea class="input area" placeholder={hint} value={card[field]} onchange={(event) => setText(field, event)}></textarea>
        </label>
      {/each}
    </div>

    <div class="section-head"><h2>Appearance prompt</h2></div>
    <div class="card">
      <label class="field stack">
        <span class="muted small">Base prompt</span>
        <textarea class="input area" placeholder="How the character looks, as tags" value={card.basePrompt} onchange={(event) => setText("basePrompt", event)}></textarea>
      </label>
      <label class="field stack">
        <span class="muted small">Default outfit</span>
        <input class="input" type="text" autocomplete="off" placeholder="What they usually wear" value={card.defaultOutfit} onchange={(event) => setText("defaultOutfit", event)} />
      </label>
      <p class="muted small" style="padding:0 14px 12px">Kept in the card for when NovelAI draws the companion. Nothing uses these yet.</p>
    </div>

    <div class="section-head"><h2>Character card</h2></div>
    <div class="card">
      <div class="field stack">
        <p class="muted small">
          A card is a picture of the companion with everything above stored inside the file. It opens in other character tools
          too. Save it to Files: saving to Photos keeps the picture and loses the character.
        </p>
        <button class="btn primary" disabled={busy} onclick={() => run(exportCard)}>Save as a card</button>
        <label class="btn" aria-disabled={busy}>
          Load a card
          <input type="file" accept="image/png,.png" hidden disabled={busy} onchange={chooseCard} />
        </label>
        {#if error}<p class="small" style="color:var(--bad)" role="alert">{error}</p>{/if}
      </div>
    </div>

    <div style="margin-top:20px">
      {#if confirmReset}
        <div class="banner" style="margin:0" role="alert">
          <p>Go back to the default companion? Its name, character and pictures will be removed. Your progress stays.</p>
          <button class="btn small" onclick={() => (confirmReset = false)}>Cancel</button>
          <button
            class="btn small danger"
            disabled={busy}
            onclick={() =>
              run(async () => {
                await resetCompanion();
                confirmReset = false;
              })}>Reset</button
          >
        </div>
      {:else}
        <button class="btn danger" style="width:100%" onclick={() => (confirmReset = true)}>Reset to the default companion</button>
      {/if}
    </div>
  </div>
</div>
