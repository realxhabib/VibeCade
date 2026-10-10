import { xPreviewImage } from "@/components/x/preview-image";
import { officialCatalogApps } from "@/platform/official-apps";

/** The `/x` card's still (`twitter:image`). */
export function GET() {
  return xPreviewImage(undefined, officialCatalogApps());
}
