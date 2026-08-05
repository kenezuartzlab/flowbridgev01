import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { takeReturnTo } from "@/lib/authReturn";

/**
 * After an OAuth round-trip, send the user back to the exact page that asked
 * them to sign in. Runs once per session restore and is a no-op when the
 * provider already returned them to the right place.
 */
export function ReturnToRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      const target = takeReturnTo();
      if (!target) return;
      const current =
        window.location.pathname + window.location.search + window.location.hash;
      if (target === current) return;
      void router.navigate({ to: target, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
