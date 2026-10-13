import { createFileRoute } from "@tanstack/react-router";
import { emptyLaunchTracker, launchTrackerSchema, LAUNCH_TRACKER_PATH } from "@/lib/application/launchTracker";

export const Route = createFileRoute("/api/admin/launch-preparation")({
  server: { handlers: {
    GET: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const gate = await requireAdmin(request);
      if (!gate.ok) return gate.response;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const storage = supabaseAdmin.storage.from("application-materials");
      const screenshot = new URL(request.url).searchParams.get("screenshot");
      if (screenshot) {
        if (!/^launch-pre-day-0\/screenshots\/[0-9a-f-]+\.(png|jpg|webp)$/.test(screenshot)) return Response.json({ error: "Invalid screenshot" }, { status: 400 });
        const { data } = await storage.download(screenshot);
        if (!data) return Response.json({ error: "Screenshot unavailable" }, { status: 404 });
        return new Response(data, { headers: { "content-type": data.type, "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", "content-disposition": "attachment" } });
      }
      const { data, error } = await storage.download(LAUNCH_TRACKER_PATH);
      if (error && !["404", "400"].includes(String((error as { statusCode?: string }).statusCode))) return Response.json({ error: "Launch evidence storage unavailable" }, { status: 503 });
      try {
        const tracker = data ? launchTrackerSchema.parse(JSON.parse(await data.text())) : emptyLaunchTracker();
        const { default: drafts } = await import("../../../docs/private/bot-application/launch-pre-day-0.md?raw");
        return Response.json({ tracker, drafts, revision: data ? await data.text() : null }, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });
      } catch { return Response.json({ error: "Stored launch evidence failed validation; not overwritten" }, { status: 503 }); }
    },
    PUT: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const gate = await requireAdmin(request);
      if (!gate.ok) return gate.response;
      if (gate.admin.role !== "super_admin") return Response.json({ error: "Owner admin access required" }, { status: 403 });
      try {
        if (Number(request.headers.get("content-length") ?? 0) > 4000000) return Response.json({ error: "Evidence too large" }, { status: 413 });
        const body = await request.text();
        if (body.length > 4000000) return Response.json({ error: "Evidence too large" }, { status: 413 });
        const tracker = launchTrackerSchema.parse(JSON.parse(body));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage.from("application-materials").upload(LAUNCH_TRACKER_PATH, new Blob([JSON.stringify(tracker)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
        if (error) return Response.json({ error: "Evidence could not be saved" }, { status: 503 });
        return Response.json({ tracker }, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });
      } catch { return Response.json({ error: "Invalid evidence. Day 0 and qualification windows must remain NOT STARTED." }, { status: 400 }); }
    },
    POST: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const gate = await requireAdmin(request);
      if (!gate.ok) return gate.response;
      if (gate.admin.role !== "super_admin") return Response.json({ error: "Owner admin access required" }, { status: 403 });
      if (Number(request.headers.get("content-length") ?? 0) > 11000000) return Response.json({ error: "Screenshot must be under 10 MB" }, { status: 413 });
      try {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 10000000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Response.json({ error: "Use a PNG, JPEG or WebP under 10 MB" }, { status: 400 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
        const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
        if (!(file.type === "image/png" ? png : file.type === "image/jpeg" ? jpg : webp)) return Response.json({ error: "Screenshot content does not match its image type" }, { status: 400 });
        const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
        const path = `launch-pre-day-0/screenshots/${crypto.randomUUID()}.${ext}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage.from("application-materials").upload(path, file, { contentType: file.type });
        if (error) return Response.json({ error: "Private screenshot upload failed" }, { status: 503 });
        return Response.json({ path }, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });
      } catch { return Response.json({ error: "Screenshot upload failed" }, { status: 400 }); }
    },
  } },
});