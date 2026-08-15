# @le/ui-kit

Stencil design system for Local Events. Framework-agnostic web components —
the same `<le-post-card>` works in any fragment, and would work in a future
React or Angular admin tool.

Depends on [`@le/shared`](https://github.com/aruhyak/localevents-shared).

## Components

| Tag | Purpose |
|---|---|
| `<le-badge>` | Status pill — post kind, verified business, licence state |
| `<le-post-card>` | One post in the feed. Renders all three post shapes |

## Tokens

`src/tokens.css` holds the palette, in light and dark. Import it once in the
shell:

```ts
import '@le/ui-kit/tokens.css';
```

**The two accents carry meaning, not decoration:**

```
com  #C92C68   an individual posted this
biz  #1257B0   a business posted this
```

Keep that rule and the feed is readable at a glance. Break it and the colour
stops meaning anything.

`good` marks verified and licensed; `warn` marks unverified and gated.

## Honest badges

Licence badges show **unverified** rather than nothing when a trade is gated.
California SB 378 requires platforms to disclose *whether* they verify — silence
is not an option, so the component makes the honest state the easy one.

## Using it from a fragment

```json
"dependencies": {
  "@le/ui-kit": "github:aruhyak/localevents-ui-kit#v0.1.0"
}
```

```ts
import '@le/ui-kit';   // auto-defines the custom elements
```

Built with `customElementsExportBehavior: 'auto-define-custom-elements'`, so
importing the module registers the tags — no `defineCustomElements()` call.

## Known cost of the polyrepo split

Each fragment that imports this bundles its own copy — roughly 16 KB. With six
fragments that is six copies of the design system on the wire.

Before phase 3 this should move to a shared import map so the shell loads
`ui-kit` once and fragments reference it. Noted here so it isn't discovered
in production.

## Local development

```bash
npm install
npm run build
npm run dev      # watch + serve
```

## Releasing

```bash
npm version patch
git tag -a v0.1.1 -m "v0.1.1 — what changed"
git push --follow-tags
```

Use **annotated** tags (`-a`). Lightweight tags are skipped by `--follow-tags`
and consumers will silently keep the old version.
