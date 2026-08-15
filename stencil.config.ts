import { Config } from '@stencil/core';

const isDev =
  process.argv.includes('--dev') ||
  process.argv.includes('--watch') ||
  process.env.NODE_ENV === 'development';

export const config: Config = {
  namespace: 'le-ui',
  taskQueue: 'async',
  // Source maps ship your ORIGINAL TypeScript, comments and all — worse than
  // a public repo, since the deployed site would serve your source verbatim.
  // Keep them locally for debugging, strip them from production builds.
  sourceMap: isDev,
  outputTargets: [
    {
      // Tree-shakable custom elements. `auto-define-custom-elements` means a
      // consumer only has to import the module — no defineCustomElements() call.
      type: 'dist-custom-elements',
      customElementsExportBehavior: 'auto-define-custom-elements',
      externalRuntime: false,
      generateTypeDeclarations: true,
    },
  ],
  extras: {
    enableImportInjection: true,
  },
};
