import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `You are Flow, the in-app assistant for FlowBridge — a guided swap and cross-chain bridge app built on BOT Chain.

What you know about the app:
- Tabs: CA/BOT (fixed pair swap), SWAP (any BOT Chain token pair via FlowBridgeRouter), BRIDGE (USDT between BOT Chain and BNB/ETH/TRON).
- Bridging has a 10 USDT minimum. A 0.1% platform fee applies to swaps and bridges and is always disclosed in the UI.
- FLOW points: 1 point per $1 of swap volume, starting at $5. Referral claims require $100 of volume and linked socials.
- Pages: /home (dashboard), /wallet (BOT Chain balances), /markets (prices), /rewards (FLOW points), /activity (history), /partners (mini-apps and quests).
- Users need a small amount of BOT for gas; below 0.05 BOT the app warns them.

Rules:
- Be concise: 2-5 short sentences or a tight bullet list. Plain language, no jargon dumps.
- Explain how to do things in FlowBridge; point to the right tab or page.
- Never give financial advice, price predictions, or promises of returns.
- Never ask for seed phrases or private keys, and warn the user if anyone does.
- If you are unsure about live on-chain data (balances, exact prices, tx status), say so and point to the page that shows it.`;

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "Assistant is not configured yet." }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        let messages: { role: string; content: string }[] = [];
        try {
          const body = (await request.json()) as {
            messages?: { role?: string; content?: string }[];
          };
          messages = (body.messages ?? [])
            .filter(
              (m) =>
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string" &&
                m.content.trim().length > 0,
            )
            .slice(-12)
            .map((m) => ({ role: m.role as string, content: String(m.content).slice(0, 2000) }));
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request body." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        if (messages.length === 0) {
          return new Response(JSON.stringify({ error: "Ask a question first." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            stream: true,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return new Response(
            JSON.stringify({
              error:
                status === 429
                  ? "Too many questions right now — try again in a moment."
                  : status === 402
                    ? "Assistant credits are exhausted."
                    : "The assistant is unavailable right now.",
              detail: detail.slice(0, 300),
            }),
            { status, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(upstream.body, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
