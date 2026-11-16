<script lang="ts">
  // What NovelAI is doing right now: drawing, asking before it spends Anlas,
  // showing a picture to keep or throw away, or reporting what went wrong.
  // Shows nothing when none of those is happening.
  import { approve, discard, draw, nai } from "../novelai.svelte.ts";

  const POSE_NAMES = { idle: "resting", happy: "happy", proud: "proud", sleepy: "sleepy", concerned: "concerned" };
</script>

{#if nai.candidate}
  {@const candidate = nai.candidate}
  <div class="card candidate">
    <img src={candidate.data} alt="The new look" />
    <div class="grow" style="display:flex;flex-direction:column;gap:8px">
      <p>
        <strong>{candidate.look.label}</strong>, {POSE_NAMES[candidate.pose]}
        <span class="muted small" style="display:block">Keep this picture, or have it drawn again.</span>
      </p>
      <button class="btn small primary" disabled={nai.busy} onclick={approve}>Keep</button>
      <button class="btn small" disabled={nai.busy} onclick={() => draw(candidate.look, candidate.pose, { manual: true, fresh: true })}>
        {nai.busy ? "Drawing…" : "Try again"}
      </button>
      <button class="btn small" disabled={nai.busy} onclick={discard}>Discard</button>
    </div>
  </div>
{:else if nai.ask}
  {@const ask = nai.ask}
  <div class="banner" style="margin:12px 0 0" role="alert">
    <p>
      Drawing this will spend Anlas: it is not free on this account right now. You have {ask.anlas.toLocaleString()} Anlas.
      NovelAI sets the amount, and it is shown after.
    </p>
    <button class="btn small" onclick={discard}>Cancel</button>
    <button class="btn small danger" disabled={nai.busy} onclick={() => draw(ask.look, ask.pose, { manual: true, paid: true })}>Spend Anlas</button>
  </div>
{:else if nai.busy}
  <p class="muted small" style="margin-top:12px" role="status">Working with NovelAI…</p>
{/if}
{#if nai.error}<p class="small" style="color:var(--bad);margin-top:8px" role="alert">{nai.error}</p>{/if}
