import * as vscode from "vscode";

export interface LegacyBlockMatch {
  id: string;
  blockType: string;
  alertLabel?: string;
  replacementLabel?: string;
  message: string;
  range: vscode.Range;
  replacement?: string;
}

export interface LegacyBlockLintOptions {
  allowedHtmlSnippets?: string[];
}

export interface CodeFenceInfoToken {
  value: string;
  startCharacter: number;
}

export type LegacyBlockType =
  | "task"
  | "hint"
  | "challenge"
  | "save"
  | "no-print"
  | "print-only"
  | "collapse";

  export type RPFBlockType =
  | "TASK"
  | "HINT"
  | "CHALLENGE"
  | "SAVE"
  | "NOPRINT"
  | "PRINTONLY"
  | "ACCORDION";
