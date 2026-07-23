// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Load all env vars (no prefix filter) into process.env so server-side routes
// (e.g. /lovable/email/*) can read SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY,
// etc. The base config still handles VITE_* injection for the client bundle.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      // Keep WalletConnect out of Vite's eager prebundle. It is loaded lazily
      // by src/lib/walletConnectConnector.ts only after the user explicitly
      // chooses WalletConnect; prebundling can preserve a broken CJS/ESM
      // EventEmitter interop path in mobile production browsers.
      exclude: ["@walletconnect/ethereum-provider"],
      esbuildOptions: {
        define: { global: "globalThis" },
      },
    },
    resolve: {
      alias: {
        // Force every import of `entities` to the hoisted v4.5.0 copy.
        // React Email's htmlparser2 dependency expects v4 paths that v5+ removed.
        "entities/lib/decode.js": path.resolve(
          process.cwd(),
          "node_modules/entities/lib/decode.js",
        ),
        "entities/lib/encode.js": path.resolve(
          process.cwd(),
          "node_modules/entities/lib/encode.js",
        ),
        entities: path.resolve(process.cwd(), "node_modules/entities"),
        blakejs: path.resolve(process.cwd(), "src/lib/polyfills/blakejs.ts"),
        "cross-fetch": path.resolve(process.cwd(), "src/lib/polyfills/cross-fetch.ts"),
        "cross-fetch/dist/browser-ponyfill.js": path.resolve(process.cwd(), "src/lib/polyfills/cross-fetch.ts"),
        eventemitter3: path.resolve(
          process.cwd(),
          "node_modules/eventemitter3/dist/eventemitter3.esm.js",
        ),
        "@walletconnect/ethereum-provider": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/ethereum-provider/dist/index.js",
        ),
        "@walletconnect/universal-provider": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/universal-provider/dist/index.js",
        ),
        "@walletconnect/sign-client": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/sign-client/dist/index.js",
        ),
        "@walletconnect/core": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/core/dist/index.js",
        ),
        "@walletconnect/jsonrpc-provider": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/jsonrpc-provider/dist/index.es.js",
        ),
        "@walletconnect/jsonrpc-http-connection": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/jsonrpc-http-connection/dist/index.es.js",
        ),
        "@walletconnect/jsonrpc-ws-connection": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/jsonrpc-ws-connection/dist/index.es.js",
        ),
        "@walletconnect/heartbeat": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/heartbeat/dist/index.es.js",
        ),
        "@walletconnect/keyvaluestorage": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/keyvaluestorage/dist/index.es.js",
        ),
        "@walletconnect/relay-auth": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/relay-auth/dist/index.es.js",
        ),
        "@walletconnect/logger": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/logger/dist/index.es.js",
        ),
        "@walletconnect/utils": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/utils/dist/index.js",
        ),
        "@walletconnect/environment": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/environment/dist/esm/index.js",
        ),
        "@walletconnect/events": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/events/dist/esm/index.js",
        ),
        "@walletconnect/jsonrpc-utils": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/jsonrpc-utils/dist/esm/index.js",
        ),
        "@walletconnect/safe-json": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/safe-json/dist/esm/index.js",
        ),
        "@walletconnect/time": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/time/dist/esm/index.js",
        ),
        "@walletconnect/window-getters": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/window-getters/dist/esm/index.js",
        ),
        "@walletconnect/window-metadata": path.resolve(
          process.cwd(),
          "node_modules/@walletconnect/window-metadata/dist/esm/index.js",
        ),
        // WalletConnect imports both default and named EventEmitter exports.
        // Keep this on a browser-safe ESM shim so production minification does
        // not mix CJS namespace interop with `new EventEmitter()` calls.
        events: path.resolve(process.cwd(), "src/lib/polyfills/events.ts"),
        "node:events": path.resolve(process.cwd(), "src/lib/polyfills/events.ts"),
      },
    },
  },
});
