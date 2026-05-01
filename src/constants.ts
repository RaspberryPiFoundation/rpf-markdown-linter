import { LegacyBlockType, RPFBlockType } from "./types";

export const ALLOWED_CODE_FENCE_ATTRIBUTES = new Set([
  "filename",
  "line_numbers",
  "line_number_start",
  "line_numbers_start",
  "line_highlights",
]);

export const VALID_CODE_FENCE_LANGUAGES = new Set([
  "arduino",
  "bash",
  "c",
  "cpp",
  "cs",
  "css",
  "dart",
  "diff",
  "go",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "jsx",
  "kotlin",
  "lua",
  "markdown",
  "md",
  "php",
  "python",
  "py",
  "r",
  "rb",
  "ruby",
  "rust",
  "scala",
  "scratch",
  "sh",
  "shell",
  "sql",
  "swift",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

export const BLOCK_TYPE_TO_ALERT_LABEL: Record<LegacyBlockType, RPFBlockType> =
  {
    task: "TASK",
    hint: "HINT",
    challenge: "CHALLENGE",
    save: "SAVE",
    "no-print": "NOPRINT",
    "print-only": "PRINTONLY",
    collapse: "ACCORDION",
  };

export const OPEN_BLOCK_PATTERN = /^\s*---\s*([a-z-]+)\s*---\s*$/i;

export const DEFAULT_ALLOWED_HTML_SNIPPETS = [
  '<br class="page-break"/>',
  '<br class="page-break" />',
];

export const SUPPORTED_BLOCK_TYPES = new Set([
  "task",
  "hint",
  "challenge",
  "save",
  "no-print",
  "print-only",
  "collapse",
  "code",
  "quiz",
]);
