<script lang="ts">
  // A one-line "add" box that sits at the end of a list.
  import Icon from "./Icon.svelte";

  let { placeholder, onadd }: { placeholder: string; onadd: (text: string) => unknown } = $props();

  let text = $state("");

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    text = "";
    void onadd(value);
  }
</script>

<form class="add-row" onsubmit={submit}>
  <span class="plus"><Icon name="plus" size={18} /></span>
  <input type="text" bind:value={text} {placeholder} aria-label={placeholder} enterkeyhint="done" autocomplete="off" />
</form>
