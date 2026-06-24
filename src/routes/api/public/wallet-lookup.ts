import { createFileRoute } from "@tanstack/react-router";

// Public endpoint (no auth): given a wallet address, report whether it is
// already bound to a registered account. Returns a MASKED email hint only —
// never the full address — so signed-out users connecting a wallet can be
// guided back to the linked account without enabling email enumeration.
export const Route = createFileRoute("/api/public/wallet-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { walletAddress } = (await request.json()) as { walletAddress?: string };
          if (!walletAddress || typeof walletAddress !== "string") {
            return Response.json({ error: "Missing walletAddress" }, { status: 400 });
          }
          const normalized = walletAddress.trim().toLowerCase();
          if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
            return Response.json({ error: "Invalid wallet address" }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id, email")
            .eq("wallet_address", normalized)
            .maybeSingle();

          if (!data) return Response.json({ bound: false });

          const emailHint = maskEmail(data.email ?? "");
          return Response.json({ bound: true, userId: data.id, emailHint });
        } catch (e: any) {
          return Response.json({ error: e?.message ?? "Lookup failed" }, { status: 500 });
        }
      },
    },
  },
});

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  const visible = local.length <= 2 ? local[0] ?? "" : local[0] + local[local.length - 1];
  const stars = "•".repeat(Math.max(3, local.length - visible.length));
  const [dName, ...dRest] = domain.split(".");
  const dMasked = dName.length <= 2 ? dName[0] + "•" : dName[0] + "•".repeat(dName.length - 1);
  return `${visible[0] ?? ""}${stars}${visible[1] ?? ""}@${dMasked}.${dRest.join(".")}`;
}
