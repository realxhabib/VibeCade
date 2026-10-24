import type { AppPlayer } from "@/platform/types";

/** A CSV cell: quoted when needed, and names that start like a formula are defused for spreadsheets. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const HEADER = ["handle", "name", "email", "matches", "wins", "opens", "first_seen", "last_seen", "email_shared_at"];

/** The roster as CSV (one row per player, header first). */
export function playersCsv(players: AppPlayer[]): string {
  const rows = players.map((p) =>
    [p.profile.handle, p.profile.name, p.email, p.matches, p.wins, p.opens, p.firstSeenAt, p.lastSeenAt, p.emailSharedAt].map(cell).join(","),
  );
  return [HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
