import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "@/server";
const html = () => new Response("<html></html>", { headers: { "content-type": "text/html" } });
describe("security headers", () => {
  it("blocks cross-origin framing on production", () => {
    const r = withSecurityHeaders(new Request("https://flowbridge.space/ops"), html());
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
  it("keeps preview embeddable and CSP report-only", () => {
    const r = withSecurityHeaders(new Request("https://id-preview--x.lovable.app/"), html());
    expect(r.headers.get("x-frame-options")).toBeNull();
    expect(r.headers.get("content-security-policy-report-only")).toContain("object-src 'none'");
  });
});
