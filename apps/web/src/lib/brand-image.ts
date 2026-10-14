import { readFile } from "node:fs/promises";
import { join } from "node:path";

let mark: Promise<string> | null = null;

/**
 * The VibeCade mark as a data URL, for share images (ImageResponse renders
 * without network access). Server only: read from apps/web/assets.
 */
export function brandMarkSrc(): Promise<string> {
  mark ??= readFile(join(process.cwd(), "assets/vibecade-mark.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`);
  return mark;
}
