/**
 * V15 §2 — provider-agnostic Model Gateway.
 *
 * The reasoning model can be swapped without binding product state to a vendor.
 * A local/offline inference adapter can be registered later; V15 does not
 * require one, and when NO provider is reachable the fabric still answers from
 * grounded evidence (see `groundedFallbackAnswer`).
 */
export interface ModelRequest {
  system: string;
  messages: readonly { role: "user" | "assistant"; content: string }[];
  maxOutputChars?: number;
}

export interface ModelResult {
  ok: boolean;
  text: string;
  provider: string;
  /** Set when the provider failed; caller falls back to grounded evidence text. */
  error?: string;
}

export interface ModelProvider {
  id: string;
  available(): boolean;
  complete(req: ModelRequest): Promise<ModelResult>;
}

/** Lovable AI Gateway provider (default). */
export function lovableGatewayProvider(model = "google/gemini-2.5-flash"): ModelProvider {
  return {
    id: `lovable:${model}`,
    available: () => !!process.env["LOVABLE_API_KEY"],
    async complete(req) {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return { ok: false, text: "", provider: `lovable:${model}`, error: "no_api_key" };
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: req.system }, ...req.messages],
          }),
        });
        if (!res.ok) {
          return {
            ok: false,
            text: "",
            provider: `lovable:${model}`,
            error: res.status === 429 ? "rate_limited" : res.status === 402 ? "credits" : `upstream_${res.status}`,
          };
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) return { ok: false, text: "", provider: `lovable:${model}`, error: "empty" };
        return {
          ok: true,
          text: req.maxOutputChars ? text.slice(0, req.maxOutputChars) : text,
          provider: `lovable:${model}`,
        };
      } catch (e) {
        return {
          ok: false,
          text: "",
          provider: `lovable:${model}`,
          error: e instanceof Error ? e.name : "network_error",
        };
      }
    },
  };
}

/** Routes across registered providers in order; first available wins. */
export async function routeModelRequest(
  req: ModelRequest,
  providers: readonly ModelProvider[] = [lovableGatewayProvider()],
): Promise<ModelResult> {
  const errors: string[] = [];
  for (const p of providers) {
    if (!p.available()) {
      errors.push(`${p.id}:unavailable`);
      continue;
    }
    const result = await p.complete(req);
    if (result.ok) return result;
    errors.push(`${p.id}:${result.error ?? "failed"}`);
  }
  return { ok: false, text: "", provider: "none", error: errors.join(",") || "no_provider" };
}

export function anyProviderAvailable(
  providers: readonly ModelProvider[] = [lovableGatewayProvider()],
): boolean {
  return providers.some((p) => p.available());
}
