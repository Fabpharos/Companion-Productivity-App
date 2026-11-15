<script lang="ts" module>
  // Line icons on a 24-unit grid, drawn with the current text colour.
  const PATHS = {
    today: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    lists: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
    chores: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z",
    trips: "M3 13.5l18-8-5.5 15-3.5-6.5L3 13.5ZM12 14l4-4",
    companion: "M12 20.5S4 15.6 4 9.8A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.3c0 5.8-8 10.7-8 10.7Z",
    search: "M17 17l4 4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5l4.5 4.5L19 7.5",
    star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9 7V4.5h6V7",
    back: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    close: "M6 6l12 12M18 6L6 18",
    pin: "M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7",
    repeat: "M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3",
    flag: "M5 21V4M5 5h12l-2.5 4L17 13H5",
    inbox: "M4 13l2.5-8h11L20 13v6H4v-6ZM4 13h5l1 2.5h4l1-2.5h5",
    cart: "M3 4h2.5l2.3 11h10.4l1.8-8H6.5M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
    note: "M6 3.5h8.5L19 8v12.5H6v-17ZM14 3.5V8.5h5M9 13h7M9 16.5h5",
    todo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l3 3 5-6",
    archive: "M4 8h16v11.5H4V8ZM3 4.5h18V8H3V4.5ZM10 12h4",
    calendar: "M4 6h16v14H4V6ZM4 10h16M8 3.5V7M16 3.5V7",
  };
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
