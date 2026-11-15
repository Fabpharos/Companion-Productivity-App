// Fetches an exchange rate. This is the one place the app asks the network
// for anything, and all it sends is two currency codes. The trip keeps the
// last rate it got, so the converter works offline.

type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const SOURCES: { url: (home: string) => string; read: (body: any, local: string) => unknown }[] = [
  // European Central Bank reference rates, updated each working day.
  { url: (home) => `https://api.frankfurter.dev/v1/latest?base=${home}`, read: (body, local) => body?.rates?.[local] },
  { url: (home) => `https://open.er-api.com/v6/latest/${home}`, read: (body, local) => body?.rates?.[local] },
];

/** How much `local` currency one unit of `home` buys. Throws when no source can say. */
export async function fetchRate(home: string, local: string, fetcher: Fetch = fetch): Promise<number> {
  const [from, to] = [home.trim().toUpperCase(), local.trim().toUpperCase()];
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error("Currencies are three-letter codes, like USD and JPY.");
  if (from === to) return 1;
  for (const source of SOURCES) {
    try {
      const response = await fetcher(source.url(from));
      if (!response.ok) continue;
      const rate = source.read(await response.json(), to);
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate;
    } catch {
      // Offline, or this source is down. Try the next.
    }
  }
  throw new Error(`No rate found for ${from} to ${to}. Check the codes, or try again when online.`);
}
