import { xPreviewImage } from "@/components/x/preview-image";
import { getOfficialApp } from "@/platform/catalog";

/** An app card's still (`twitter:image`). */
export async function GET(_request: Request, { params }: RouteContext<"/x/[slug]/preview.png">) {
  const { slug } = await params;
  const app = getOfficialApp(slug);
  if (!app) return new Response("Not found", { status: 404 });
  return xPreviewImage(app);
}
