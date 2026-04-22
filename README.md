# rpf-markdown-linter

VS Code extension to help migrate deprecated legacy RPF markdown block syntax to the new blockquote alert style.

<img width="828" height="261" alt="Screenshot 2026-04-20 at 16 32 45" src="https://github.com/user-attachments/assets/dfde5954-6478-40a6-b246-9bef3ea3c2ff" />

## Features

- Scans markdown files and warns when deprecated legacy blocks are used.
- Suggests replacements using blockquote alert syntax (for example `> [!TASK]`).
- Provides quick fixes for straightforward single-block migrations.

### Supported deprecated blocks in v1:

- `--- task ---` -> `> [!TASK]`
- `--- hint ---` -> `> [!HINT]`
- `--- challenge ---` -> `> [!CHALLENGE]`
- `--- save ---` -> `> [!SAVE]`
- `--- no-print ---` -> `> [!NOPRINT]`
- `--- print-only ---` -> `> [!PRINTONLY]`
- `--- collapse ---` -> `> [!ACCORDION]` (best-effort title parsing from `title:` metadata)
- `--- code ---` -> fenced code blocks with info-string attributes
- `--- quiz ---` -> removed (quizzes are deprecated)
- custom HTML tags (for example `<div>`, `<iframe>`, `<video>`) -> warning only (no quick fix)

## Quick fix behavior

When available, use the lightbulb quick fix on a warning to rewrite the full deprecated block into blockquote syntax:

- inserts an alert header (`> [!LABEL]`)
- preserves block body content
- rewrites body lines as quoted markdown lines
- for `--- code ---`, rewrites metadata to fenced code attributes (for example `line_numbers="true"`)

You can also run fix-all flows:

- **Current file**: use Source Action -> Fix All to apply all auto-fixable lints in the file.
- **Workspace/folder**: run `RPF Markdown Linter: Fix All Auto-fixable Issues in Workspace` from the Command Palette.

<img width="417" height="388" alt="Screenshot 2026-04-20 at 16 54 31" src="https://github.com/user-attachments/assets/de668ec7-1dac-48e8-8e5a-2e66fa8150fb" />

## Installing the extension in VSCode

1. Download the latest `.vsix` file from the [Releases](https://github.com/RaspberryPiFoundation/rpf-markdown-linter/releases) page
2. Open Visual Studio Code
3. Press Command+Shift+P to open the command menu and search for "Extensions: Install from VSIX" and select it
4. When the file browser opens, find where you downloaded the `.vsix` file from step 1 and open it.
5. The extension should be installed.
6. Open a `.md` markdown file - you should see lint errors, along with options to quick fix them by pressing Command+fullstop, or hovering on the error squiggles.
7. You can quick fix an entire folder by pressing Command+Shift+P and searching for `RPF Markdown Linter: Fix All Auto-fixable Issues in Workspace`.

## Current limitations (v1)

The following are intentionally out of scope for v1.1 and are not auto-migrated:

- grouped hints (`--- hints ---` with nested `--- hint ---`)
- automatic HTML-to-markdown conversion

## Configuration

- `rpfMarkdownLinter.allowedHtmlSnippets`: list of HTML snippets that should not raise warnings.
- Default allowlist includes:
  - `<br class="page-break"/>`
  - `<br class="page-break" />`
- Matching is case-insensitive and normalizes repeated whitespace.

## Development

- `yarn compile` to build
- `yarn lint` to run linting
- `yarn test` to run extension tests

## Publishing a new release:

1. Open a PR and increment the version number in `package.json`
2. Merge the PR
3. Create a Release with a tag for the version
4. Once the Release is created, the .vsix file should be uploaded to the release shortly after.
