// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// `MUERA_STATIC=1 npm run build` makes a static single-page build for PHP/static hosts
// (for example InfinityFree). The AI endpoint then runs separately (see hosting/php-api).
// The default build is unchanged (server-rendered, Cloudflare Workers output).
const staticBuild = process.env.MUERA_STATIC === "1";

export default defineConfig(
  staticBuild
    ? {
        nitro: false,
        tanstackStart: { spa: { enabled: true } },
      }
    : {
        tanstackStart: {
          // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
          // nitro/vite builds from this
          server: { entry: "server" },
        },
      },
);
