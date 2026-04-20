# rpf-markdown-linter

VS Code extension to help migrate deprecated legacy RPF markdown block syntax to the new blockquote alert style.

## Features

- Scans markdown files and warns when deprecated legacy blocks are used.
- Suggests replacements using blockquote alert syntax (for example `> [!TASK]`).
- Provides quick fixes for straightforward single-block migrations.

Supported deprecated blocks in v1:

- `--- task ---` -> `> [!TASK]`
- `--- hint ---` -> `> [!HINT]`
- `--- challenge ---` -> `> [!CHALLENGE]`
- `--- save ---` -> `> [!SAVE]`
- `--- no-print ---` -> `> [!NOPRINT]`
- `--- print-only ---` -> `> [!PRINTONLY]`
- `--- collapse ---` -> `> [!ACCORDION]` (best-effort title parsing from `title:` metadata)
- `--- code ---` -> fenced code blocks with info-string attributes

## Quick fix behavior

When available, use the lightbulb quick fix on a warning to rewrite the full deprecated block into blockquote syntax:

- inserts an alert header (`> [!LABEL]`)
- preserves block body content
- rewrites body lines as quoted markdown lines
- for `--- code ---`, rewrites metadata to fenced code attributes (for example `line_numbers="true"`)

## Current limitations (v1)

The following are intentionally out of scope for v1.1 and are not auto-migrated:

- grouped hints (`--- hints ---` with nested `--- hint ---`)
- `--- quiz ---` removal
- HTML callout/info-box linting

## Development

- `yarn compile` to build
- `yarn lint` to run linting
- `yarn test` to run extension tests
