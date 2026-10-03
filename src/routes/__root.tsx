import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { trackProductEvent } from "../lib/ops/productEvents";
import { Toaster } from "../components/ui/sonner";
import { THEME_BOOTSTRAP } from "../lib/theme";
import { ReturnToRedirect } from "../components/auth/ReturnToRedirect";
import { FlowAiLauncher } from "../components/assistant/FlowAiLauncher";
import { readPrefs, unlockPrefsFormatting } from "../lib/prefs";
import { areaForPath, trackProductEvent } from "../lib/ops/productEvents";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    try {
      trackProductEvent("client_error", "other", {
        errorKind: error instanceof Error ? error.name : "UnknownError",
      });
    } catch { /* telemetry never blocks recovery */ }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "9zbQqs8Bva-Q_A-5jjOApUAwMVGaHLD-1sQcnMpJ_fg" },

      { title: "FlowBridge — Web3 Toolkit for BOT Chain" },
      { name: "description", content: "Swap, bridge, stake and earn on FlowBridge. The community Web3 toolkit for BOT Chain with cross-chain USDT transfers, verified campaigns, and AI-assisted trades." },
      { name: "author", content: "FlowBridge" },
      { property: "og:title", content: "FlowBridge — Web3 Toolkit for BOT Chain" },
      { property: "og:description", content: "Swap, bridge, stake and earn on FlowBridge. The community Web3 toolkit for BOT Chain with cross-chain USDT transfers, verified campaigns, and AI-assisted trades." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "FlowBridge" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "FlowBridge — Web3 Toolkit for BOT Chain" },
      { name: "twitter:description", content: "Swap, bridge, stake and earn on FlowBridge. The community Web3 toolkit for BOT Chain with cross-chain USDT transfers, verified campaigns, and AI-assisted trades." },

      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/K37tiR3OeNSFzsIqgemgtTc7RQQ2/social-images/social-1782304268835-1000045869.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/K37tiR3OeNSFzsIqgemgtTc7RQQ2/social-images/social-1782304268835-1000045869.webp" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;650;700&family=JetBrains+Mono:wght@400;500;600;750;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the persisted light/dark theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Ops V1 — aggregate, category-level journey events (no identity, no URLs with params).
  useEffect(() => {
    const area = areaForPath(pathname);
    trackProductEvent("visit", "home", { once: true });
    trackProductEvent("page_view", area);
    if (area === "discover") trackProductEvent("explore_opened", "discover", { once: true });
  }, [pathname]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") trackProductEvent("account_signed_in", "account", { once: true });
      });
      unsub = () => data.subscription.unsubscribe();
    }).catch(() => undefined);
    return () => unsub?.();
  }, []);

  // Hydrate display currency / locale preferences before any formatted value renders.
  useEffect(() => {
    readPrefs();
    // Apply currency/locale only after hydration (see unlockPrefsFormatting).
    // Wait until hydration has settled (load + two frames) so lazily hydrated
    // subtrees never see a currency switch mid-hydration.
    let raf = 0;
    const start = () => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(unlockPrefsFormatting);
      });
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);



  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <ReturnToRedirect />
      <Outlet />
      <FlowAiLauncher />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
