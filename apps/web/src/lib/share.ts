/** Opens the X post composer. The user always confirms the post themselves. */
export function xIntentUrl(text: string, url?: string): string {
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", text);
  if (url) intent.searchParams.set("url", url);
  return intent.toString();
}

/**
 * Shares a post: through the share host when one is set (the X player card,
 * where a popup opened after an await is blocked and X's in-app browsers
 * often can't open one at all: it shows a sheet to copy the link, use the
 * phone's share menu, or post on X from a fresh tap), else straight to X's
 * composer.
 */
export function openXIntent(text: string, url?: string): void {
  if (shareHost) {
    shareHost({ text, url });
    return;
  }
  postOnX(text, url);
}

/** X's composer in a popup (call it from a tap); a top-level page that can't open one goes there instead. */
export function postOnX(text: string, url?: string): void {
  const intent = xIntentUrl(text, url);
  const popup = window.open(intent, "_blank", "width=600,height=520");
  if (popup) {
    popup.opener = null;
    return;
  }
  if (window.top === window.self) window.location.assign(intent);
}

export interface ShareRequest {
  text: string;
  url?: string;
}

let shareHost: ((request: ShareRequest) => void) | null = null;

/** The X player sets this to show its share sheet; returns the unset. */
export function setShareHost(host: (request: ShareRequest) => void): () => void {
  shareHost = host;
  return () => {
    if (shareHost === host) shareHost = null;
  };
}

export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

/**
 * Copies text. The clipboard API isn't allowed in a frame that wasn't given
 * clipboard-write (the X player inside a post): then the old select-and-copy
 * way, which still works from a tap.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyBySelection(text);
  }
}

function copyBySelection(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.top = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
