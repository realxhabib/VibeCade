import { XPlayerHub } from "@/components/x/player-hub";
import { officialCatalogApps } from "@/platform/official-apps";

/** The whole catalog, inside the post. */
export default function XPlayerPage() {
  return <XPlayerHub apps={officialCatalogApps()} />;
}
