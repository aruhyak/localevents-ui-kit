import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'le-ui',
  taskQueue: 'async',
  sourceMap: true,
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
