"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// §22: "next available Executive" needs availability to be a real, recorded
// thing. It is explicit and self-declared — the database cannot see who is
// logged in, and guessing from session activity would be exactly the kind of
// inference this project avoids.
export default function AvailabilityToggle({ isAvailable }: { isAvailable: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_availability", {
      p_is_available: !isAvailable,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={submitting}
      title={error ?? (isAvailable ? "You can receive handovers" : "You will not receive handovers")}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        isAvailable
          ? "bg-good/15 text-emerald-300 hover:bg-good/20"
          : "bg-card2 text-muted hover:bg-line2"
      }`}
    >
      {isAvailable ? "On shift" : "Off shift"}
    </button>
  );
}
