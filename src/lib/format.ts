// Fixed locale + timeZone so this renders identically on the server and the client (avoids a hydration mismatch).
export function formatIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
