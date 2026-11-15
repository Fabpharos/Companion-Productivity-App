// Trip templates: what a new trip starts with. Plain data. A template gives
// packing items by category, tasks to do before leaving (with how many days
// before departure each is due), and phrase cards by situation.
//
// Every template builds on GENERAL, so anything added there reaches all trips.

export type Phrase = [text: string, reading: string, meaning: string];

export interface TripTemplate {
  id: string;
  name: string;
  destination: string;
  localCurrency: string;
  /** What the companion wears for trips made from this template. */
  outfit: string;
  packing: Record<string, string[]>;
  tasks: [text: string, daysBefore: number][];
  phrases: Record<string, Phrase[]>;
}

export const GENERAL: TripTemplate = {
  id: "general",
  name: "Any trip",
  destination: "",
  localCurrency: "",
  outfit: "",
  packing: {
    Documents: ["Passport or ID", "Tickets and booking confirmations", "Travel insurance details", "Cards and some cash"],
    Clothes: ["Underwear", "Socks", "Tops", "Trousers", "Sleepwear", "Jacket", "Comfortable walking shoes"],
    Toiletries: ["Toothbrush and toothpaste", "Deodorant", "Medication", "Sunscreen"],
    Electronics: ["Phone and charger", "Power bank", "Headphones", "Plug adapter"],
    Other: ["Water bottle", "Day bag"],
  },
  tasks: [
    ["Check the passport's expiry date", 60],
    ["Book accommodation", 45],
    ["Buy travel insurance", 30],
    ["Tell the bank and card companies", 7],
    ["Arrange care for pets and plants", 7],
    ["Put a hold on mail and deliveries", 5],
    ["Download offline maps", 3],
    ["Check in online", 1],
    ["Charge everything and pack the chargers", 1],
    ["Empty the fridge and take out the rubbish", 0],
  ],
  phrases: {},
};

export const JAPAN: TripTemplate = {
  ...GENERAL,
  id: "japan",
  name: "Japan",
  destination: "Japan",
  localCurrency: "JPY",
  outfit: "kimono",
  packing: {
    ...GENERAL.packing,
    Documents: [...GENERAL.packing.Documents!, "Visit Japan Web QR codes, saved offline"],
    Clothes: [...GENERAL.packing.Clothes!, "Shoes that slip on and off easily", "Socks without holes, for shoes-off places"],
    Other: [...GENERAL.packing.Other!, "Coin purse", "Small hand towel", "A bag for carrying rubbish until you find a bin"],
  },
  tasks: [
    ...GENERAL.tasks,
    ["Book restaurants and timed-entry tickets", 30],
    ["Work out whether a rail pass is worth it for the route", 21],
    ["Register on Visit Japan Web for immigration and customs", 7],
    ["Buy an eSIM or reserve pocket Wi-Fi", 7],
    ["Add a transit card (Suica or PASMO) to Apple Wallet", 5],
    ["Get some yen in cash", 5],
    ["Download Japanese for offline translation", 3],
  ],
  phrases: {
    Basics: [
      ["すみません", "Sumimasen", "Excuse me / Sorry"],
      ["ありがとうございます", "Arigatō gozaimasu", "Thank you"],
      ["英語を話せますか？", "Eigo o hanasemasu ka?", "Do you speak English?"],
      ["日本語がわかりません", "Nihongo ga wakarimasen", "I don't understand Japanese"],
      ["これをお願いします", "Kore o onegaishimasu", "This one, please"],
    ],
    Eating: [
      ["一人です", "Hitori desu", "A table for one"],
      ["英語のメニューはありますか？", "Eigo no menyū wa arimasu ka?", "Do you have an English menu?"],
      ["おすすめは何ですか？", "Osusume wa nan desu ka?", "What do you recommend?"],
      ["アレルギーがあります", "Arerugī ga arimasu", "I have an allergy"],
      ["お会計をお願いします", "Okaikei o onegaishimasu", "The bill, please"],
      ["カードは使えますか？", "Kādo wa tsukaemasu ka?", "Can I pay by card?"],
    ],
    "Getting around": [
      ["＿＿はどこですか？", "___ wa doko desu ka?", "Where is ___?"],
      ["この電車は＿＿に行きますか？", "Kono densha wa ___ ni ikimasu ka?", "Does this train go to ___?"],
      ["切符はどこで買えますか？", "Kippu wa doko de kaemasu ka?", "Where can I buy a ticket?"],
      ["道に迷いました", "Michi ni mayoimashita", "I'm lost"],
    ],
    Shopping: [
      ["いくらですか？", "Ikura desu ka?", "How much is it?"],
      ["免税はできますか？", "Menzei wa dekimasu ka?", "Can I buy this tax-free?"],
      ["袋はいりません", "Fukuro wa irimasen", "I don't need a bag"],
    ],
    Hotel: [
      ["チェックインをお願いします", "Chekku-in o onegaishimasu", "I'd like to check in"],
      ["荷物を預かってもらえますか？", "Nimotsu o azukatte moraemasu ka?", "Could you hold my luggage?"],
    ],
    Emergency: [
      ["助けてください", "Tasukete kudasai", "Please help me"],
      ["病院はどこですか？", "Byōin wa doko desu ka?", "Where is a hospital?"],
    ],
  },
};

export const TEMPLATES: TripTemplate[] = [GENERAL, JAPAN];
