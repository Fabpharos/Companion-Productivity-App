import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import App from "./App.svelte";
import "./app.css";
import { start } from "./state.svelte.ts";

// Caches the app for offline use and picks up new versions as they are published.
registerSW({ immediate: true });

start();
mount(App, { target: document.getElementById("app")! });
