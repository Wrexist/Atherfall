import { createFileRoute } from "@tanstack/react-router";
import { Game } from "../game/ui/Game";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aetherfall — Dawnreach" },
      {
        name: "description",
        content:
          "Aetherfall is a browser-based third-person action RPG. Explore Dawnreach, cull the Bramblekin, loot and equip gear, and bring down Thornmaw at the Sunken Arch.",
      },
      { property: "og:title", content: "Aetherfall — Dawnreach" },
      {
        property: "og:description",
        content:
          "A playable 3D action RPG in the browser: fight, loot, equip and quest through the starter region of Dawnreach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
