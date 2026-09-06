// Supabase project connection constants for MONARCH Maintenance.
//
// These are the PUBLISHABLE (anon) URL/key pair, not secrets: Supabase's own
// security model is "safe to ship in a client bundle, protected by Row Level
// Security" (IMPLEMENTATION_PACK.md §29) — the same category as a Firebase
// apiKey. They still read from env vars first so local/dashboard overrides
// work, but fall back to the real values rather than failing the build,
// because this session's Vercel tooling has no way to set project
// environment variables (see STATUS.md / RISK_REGISTER.md) — only to link
// the repo and deploy. A service-role/secret key would NEVER be handled this
// way; only the publishable pair is.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://maavrlqkdrisjwzhjdgg.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYXZybHFrZHJpc2p3emhqZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2Nzg0NDEsImV4cCI6MjEwNDI1NDQ0MX0.YemIDFzzo8BwBSbtzrL_rDU33exBtnLVvz5htIDNFls";
