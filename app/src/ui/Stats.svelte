<script lang="ts">
  // Level, points to spend, and streak.
  import { data } from "../state.svelte.ts";
  import Icon from "./Icon.svelte";

  const game = $derived(data.game);
</script>

<div class="stats">
  <div class="stat">
    <div class="value">Level {game.level.level}</div>
    <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={game.level.span} aria-valuenow={game.level.into} aria-label="Progress to next level">
      <span style:width="{(100 * game.level.into) / game.level.span}%"></span>
    </div>
    <div class="label" style="margin-top:4px">{game.level.span - game.level.into} to level {game.level.level + 1}</div>
  </div>
  <div class="stat">
    <div class="value"><Icon name="star" size={18} />{game.balance}</div>
    <div class="label">points{game.today ? ` · +${game.today} today` : ""}</div>
  </div>
  <div class="stat">
    <div class="value"><Icon name="flame" size={18} />{game.streak.days}</div>
    <div class="label">
      {game.streak.days === 1 ? "day" : "days"} in a row{game.streak.days && game.streak.pending ? " · keep it going today" : ""}
    </div>
  </div>
</div>
