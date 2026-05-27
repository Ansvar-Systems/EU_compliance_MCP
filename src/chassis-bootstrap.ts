// Phase 5.B chassis-bootstrap — custom entrypoint that calls mcp-base serve()
// with the EU extensionHandlers Map.
//
// Replaces the default chassis ENTRYPOINT (`node ./dist/cli.js --serve`)
// in our Dockerfile. The chassis loads from /app/dist/serve.js at runtime;
// we dynamic-import to avoid a TypeScript build-time dependency on a private
// (un-published) package — see src/extension-handlers/types.ts for the
// structural-typing trick we use to keep the consumer compiling.
//
// Invariant: chassis serve() registers all chassis-standard tools first, then
// appends extensionHandlers. Name conflicts (extension shadows chassis tool)
// throw synchronously at server-factory construction — by design.

import { euExtensionHandlers } from './extension-handlers/index.js';

interface ServeOptions {
  manifestPath: string;
  dbPath: string;
  catalogPath: string;
  catalogSha: string;
  baseVersion: string;
  port: number;
  catalogBundlePath?: string;
  premiumDbPath?: string;
  extensionHandlers?: Map<string, unknown>;
}

interface ChassisModule {
  serve: (opts: ServeOptions) => Promise<unknown>;
  serveOptionsFromEnv: () => ServeOptions;
}

async function main(): Promise<void> {
  // The chassis is COPYed into the image via FROM ghcr.io/ansvar-systems/mcp-base
  // at /app/dist/. Dynamic import resolves at runtime against the chassis layer.
  // Path is in a variable so TypeScript (moduleResolution: bundler) doesn't try
  // to resolve the absolute path at compile time.
  const chassisServePath = '/app/dist/serve.js';
  const chassis = (await import(chassisServePath)) as ChassisModule;
  const opts = chassis.serveOptionsFromEnv();
  opts.extensionHandlers = euExtensionHandlers;

  // eslint-disable-next-line no-console
  console.error(
    `[chassis-bootstrap] starting with ${euExtensionHandlers.size} extension handlers: ${Array.from(euExtensionHandlers.keys()).join(', ')}`,
  );

  await chassis.serve(opts);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[chassis-bootstrap] fatal:', err);
  process.exit(1);
});
