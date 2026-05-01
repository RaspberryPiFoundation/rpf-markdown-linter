import * as vscode from "vscode";
import {
  ALLOWED_CODE_FENCE_ATTRIBUTES,
  BLOCK_TYPE_TO_ALERT_LABEL,
  DEFAULT_ALLOWED_HTML_SNIPPETS,
  OPEN_BLOCK_PATTERN,
  SUPPORTED_BLOCK_TYPES,
  VALID_CODE_FENCE_LANGUAGES,
} from "./constants";
import {
  CodeFenceInfoToken,
  LegacyBlockLintOptions,
  LegacyBlockMatch,
  LegacyBlockType,
} from "./types";

const isLegacyBlockType = (value: string): value is LegacyBlockType => {
  return value in BLOCK_TYPE_TO_ALERT_LABEL;
};

function normalizeHtmlSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenizeCodeFenceInfoString(
  infoString: string,
  startCharacter: number,
): CodeFenceInfoToken[] {
  const tokens: CodeFenceInfoToken[] = [];
  let current = "";
  let currentStart = -1;
  let quote: string | undefined;

  for (let i = 0; i < infoString.length; i++) {
    const character = infoString[i];
    if (quote) {
      current += character;
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      if (currentStart < 0) {
        currentStart = i;
      }
      current += character;
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push({
          value: current,
          startCharacter: startCharacter + currentStart,
        });
        current = "";
        currentStart = -1;
      }
      continue;
    }

    if (currentStart < 0) {
      currentStart = i;
    }
    current += character;
  }

  if (current.length > 0) {
    tokens.push({
      value: current,
      startCharacter: startCharacter + currentStart,
    });
  }

  return tokens;
}

function getCodeFenceAttributeName(token: string): string {
  const separatorIndex = token.indexOf("=");
  const attributeName =
    separatorIndex < 0 ? token : token.slice(0, separatorIndex);
  return attributeName.trim().toLowerCase();
}

function addFencedCodeAttributeDiagnostics(
  matches: LegacyBlockMatch[],
  document: vscode.TextDocument,
  lineIndex: number,
  line: string,
  fenceToken: string,
  infoString: string,
): void {
  const infoStringStart = line.indexOf(
    infoString,
    line.indexOf(fenceToken) + fenceToken.length,
  );
  const tokens = tokenizeCodeFenceInfoString(infoString, infoStringStart);
  if (tokens.length === 0) {
    const startCharacter = line.indexOf(fenceToken);
    const start = new vscode.Position(lineIndex, startCharacter);
    const end = new vscode.Position(
      lineIndex,
      startCharacter + fenceToken.length,
    );
    matches.push({
      id: `${document.uri.toString()}#${lineIndex}:code-fence-language`,
      blockType: "code-fence-language",
      message:
        "Fenced code blocks must start with a valid programming language.",
      range: new vscode.Range(start, end),
    });
    return;
  }

  const languageToken = tokens[0];
  if (!VALID_CODE_FENCE_LANGUAGES.has(languageToken.value.toLowerCase())) {
    const start = new vscode.Position(lineIndex, languageToken.startCharacter);
    const end = new vscode.Position(
      lineIndex,
      languageToken.startCharacter + languageToken.value.length,
    );
    matches.push({
      id: `${document.uri.toString()}#${lineIndex}:code-fence-language`,
      blockType: "code-fence-language",
      message:
        "Fenced code blocks must start with a valid programming language.",
      range: new vscode.Range(start, end),
    });
  }

  for (const attributeToken of tokens.slice(1)) {
    const attributeName = getCodeFenceAttributeName(attributeToken.value);
    if (ALLOWED_CODE_FENCE_ATTRIBUTES.has(attributeName)) {
      continue;
    }

    const start = new vscode.Position(lineIndex, attributeToken.startCharacter);
    const end = new vscode.Position(
      lineIndex,
      attributeToken.startCharacter + attributeName.length,
    );
    matches.push({
      id: `${document.uri.toString()}#${lineIndex}:code-fence-attribute:${attributeName}`,
      blockType: "code-fence-attribute",
      message:
        "Fenced code block attributes must be one of: filename, line_numbers, line_number_start, line_numbers_start, line_highlights.",
      range: new vscode.Range(start, end),
    });
  }
}

function findClosingLineIndex(
  lines: string[],
  startLineIndex: number,
  blockType: string,
): number {
  const closePattern = new RegExp(
    `^\\s*---\\s*\\/\\s*${blockType}\\s*---\\s*$`,
    "i",
  );
  const openPattern = new RegExp(`^\\s*---\\s*${blockType}\\s*---\\s*$`, "i");
  let depth = 1;

  for (let i = startLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (openPattern.test(line)) {
      depth++;
      continue;
    }

    if (closePattern.test(line)) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function quoteLines(lines: string[]): string[] {
  return lines.map((line) => (line.length === 0 ? ">" : `> ${line}`));
}

function stripOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") {
    start++;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }
  return lines.slice(start, end);
}

function parseCollapseMetadata(contentLines: string[]): {
  title?: string;
  bodyLines: string[];
} {
  const firstNonEmptyIndex = contentLines.findIndex(
    (line) => line.trim().length > 0,
  );
  if (firstNonEmptyIndex < 0) {
    return { bodyLines: [] };
  }

  if (contentLines[firstNonEmptyIndex].trim() !== "---") {
    return { bodyLines: contentLines };
  }

  let metadataEndIndex = -1;
  for (let i = firstNonEmptyIndex + 1; i < contentLines.length; i += 1) {
    if (contentLines[i].trim() === "---") {
      metadataEndIndex = i;
      break;
    }
  }

  if (metadataEndIndex < 0) {
    return { bodyLines: contentLines };
  }

  const metadataLines = contentLines.slice(
    firstNonEmptyIndex + 1,
    metadataEndIndex,
  );
  const titleLine = metadataLines.find((line) =>
    line.trim().toLowerCase().startsWith("title:"),
  );
  const parsedTitle = titleLine?.split(":").slice(1).join(":").trim();

  const bodyLines = contentLines.slice(metadataEndIndex + 1);
  return {
    title: parsedTitle && parsedTitle.length > 0 ? parsedTitle : undefined,
    bodyLines,
  };
}

function parseCodeMetadata(contentLines: string[]): {
  attributes: string[];
  bodyLines: string[];
} {
  const firstNonEmptyIndex = contentLines.findIndex(
    (line) => line.trim().length > 0,
  );
  if (firstNonEmptyIndex < 0) {
    return { attributes: [], bodyLines: [] };
  }

  if (contentLines[firstNonEmptyIndex].trim() !== "---") {
    return { attributes: [], bodyLines: contentLines };
  }

  let metadataEndIndex = -1;
  for (let i = firstNonEmptyIndex + 1; i < contentLines.length; i += 1) {
    if (contentLines[i].trim() === "---") {
      metadataEndIndex = i;
      break;
    }
  }

  if (metadataEndIndex < 0) {
    return { attributes: [], bodyLines: contentLines };
  }

  const metadataLines = contentLines
    .slice(firstNonEmptyIndex + 1, metadataEndIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const bodyLines = contentLines.slice(metadataEndIndex + 1);

  const attributes: string[] = [];
  for (const line of metadataLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length === 0 || value.length === 0) {
      continue;
    }

    if (key === "language") {
      continue;
    }

    attributes.push(`${key}="${value}"`);
  }

  return { attributes, bodyLines };
}

export function buildReplacement(
  blockType: string,
  contentLines: string[],
): string {
  if (blockType === "quiz") {
    return "";
  }

  if (blockType === "code") {
    const { attributes, bodyLines } = parseCodeMetadata(contentLines);
    const normalizedBody = stripOuterBlankLines(bodyLines);
    const languageMetadataLine = contentLines
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith("language:"));
    const language =
      languageMetadataLine?.split(":").slice(1).join(":").trim() ?? "";
    const infoStringParts = [language, ...attributes].filter(
      (part) => part.length > 0,
    );
    const openingFence = `\`\`\`${infoStringParts.join(" ")}`.trimEnd();
    return [openingFence, ...normalizedBody, "```", ""].join("\n");
  }

  if (!isLegacyBlockType(blockType)) {
    return contentLines.join("\n");
  }

  const alertLabel = BLOCK_TYPE_TO_ALERT_LABEL[blockType];

  let title: string | undefined;
  let bodyLines = contentLines;

  if (blockType === "collapse") {
    const collapseData = parseCollapseMetadata(contentLines);
    title = collapseData.title;
    bodyLines = collapseData.bodyLines;
  }

  const normalizedBody = stripOuterBlankLines(rewriteNestedBlocks(bodyLines));
  const header = title ? `> [!${alertLabel}] ${title}` : `> [!${alertLabel}]`;

  if (normalizedBody.length === 0) {
    return `${header}\n`;
  }

  const quotedBody = quoteLines(normalizedBody);
  return [header, ">", ...quotedBody, ""].join("\n");
}

function rewriteNestedBlocks(lines: string[]): string[] {
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const openMatch = lines[i].match(OPEN_BLOCK_PATTERN);
    if (!openMatch) {
      output.push(lines[i]);
      continue;
    }

    const blockType = openMatch[1].toLowerCase();
    if (!SUPPORTED_BLOCK_TYPES.has(blockType)) {
      output.push(lines[i]);
      continue;
    }

    if (blockType === "save") {
      const replacementLines = buildReplacement(blockType, []).split("\n");
      if (replacementLines[replacementLines.length - 1] === "") {
        replacementLines.pop();
      }
      output.push(...replacementLines);
      continue;
    }

    const closeLineIndex = findClosingLineIndex(lines, i, blockType);
    if (closeLineIndex < 0) {
      output.push(lines[i]);
      continue;
    }

    const nestedContent = lines.slice(i + 1, closeLineIndex);
    const replacementLines = buildReplacement(blockType, nestedContent).split(
      "\n",
    );
    if (replacementLines[replacementLines.length - 1] === "") {
      replacementLines.pop();
    }
    output.push(...replacementLines);
    i = closeLineIndex;
  }

  return output;
}

function buildGroupedHintsReplacement(contentLines: string[]): string {
  const hintBlocks: string[] = [];

  for (let i = 0; i < contentLines.length; i++) {
    const openMatch = contentLines[i].match(OPEN_BLOCK_PATTERN);
    if (!openMatch || openMatch[1].toLowerCase() !== "hint") {
      continue;
    }

    const closeLineIndex = findClosingLineIndex(contentLines, i, "hint");
    if (closeLineIndex < 0) {
      continue;
    }

    const hintContent = contentLines.slice(i + 1, closeLineIndex);
    hintBlocks.push(buildReplacement("hint", hintContent).trimEnd());
    i = closeLineIndex;
  }

  if (hintBlocks.length === 0) {
    return "";
  }

  return `${hintBlocks.join("\n\n")}\n`;
}

export function findLegacyBlocks(
  document: vscode.TextDocument,
  options: LegacyBlockLintOptions = {},
): LegacyBlockMatch[] {
  const lines = document.getText().split(/\r?\n/);
  const matches: LegacyBlockMatch[] = [];
  const allowedHtmlSnippets = new Set(
    (options.allowedHtmlSnippets ?? DEFAULT_ALLOWED_HTML_SNIPPETS).map(
      normalizeHtmlSnippet,
    ),
  );
  let inFencedCodeBlock = false;
  let fenceToken = "";

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmedLine = lines[lineIndex].trim();
    const fenceMatch = trimmedLine.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const token = fenceMatch[1];
      if (!inFencedCodeBlock) {
        const infoString = trimmedLine.slice(token.length).trim();
        addFencedCodeAttributeDiagnostics(
          matches,
          document,
          lineIndex,
          lines[lineIndex],
          token,
          infoString,
        );
        inFencedCodeBlock = true;
        fenceToken = token;
      } else if (token.startsWith(fenceToken[0])) {
        inFencedCodeBlock = false;
        fenceToken = "";
      }
      continue;
    }

    if (inFencedCodeBlock) {
      continue;
    }

    const openMatch = lines[lineIndex].match(OPEN_BLOCK_PATTERN);
    if (!openMatch) {
      const htmlTagMatch = lines[lineIndex].match(
        /<[/]?[a-zA-Z][\w-]*(\s[^>]*)?>/,
      );
      if (htmlTagMatch) {
        const htmlSnippet = normalizeHtmlSnippet(htmlTagMatch[0]);
        if (allowedHtmlSnippets.has(htmlSnippet)) {
          continue;
        }

        const startCharacter = htmlTagMatch.index ?? 0;
        const start = new vscode.Position(lineIndex, startCharacter);
        const end = new vscode.Position(
          lineIndex,
          startCharacter + htmlTagMatch[0].length,
        );
        const range = new vscode.Range(start, end);
        const id = `${document.uri.toString()}#${lineIndex}:html`;
        matches.push({
          id,
          blockType: "html",
          message:
            "Custom HTML in markdown is not recommended. Prefer standard markdown or supported blockquote components.",
          range,
        });
      }
      continue;
    }

    const blockType = openMatch[1].toLowerCase();
    if (blockType === "hints") {
      const closeLineIndex = findClosingLineIndex(lines, lineIndex, blockType);
      if (closeLineIndex < 0) {
        continue;
      }

      const start = new vscode.Position(lineIndex, 0);
      const end = new vscode.Position(
        closeLineIndex,
        lines[closeLineIndex].length,
      );
      const range = new vscode.Range(start, end);
      const id = `${document.uri.toString()}#${lineIndex}:${blockType}`;
      matches.push({
        id,
        blockType,
        message:
          "Grouped `--- hints ---` blocks are deprecated. Use individual `[!HINT]` blocks instead.",
        replacementLabel: "individual [!HINT] blockquote syntax",
        replacement: buildGroupedHintsReplacement(
          lines.slice(lineIndex + 1, closeLineIndex),
        ),
        range,
      });
      lineIndex = closeLineIndex;
      continue;
    }

    if (
      blockType !== "code" &&
      blockType !== "quiz" &&
      !isLegacyBlockType(blockType)
    ) {
      continue;
    }

    const alertLabel =
      blockType === "code" || blockType === "quiz"
        ? undefined
        : BLOCK_TYPE_TO_ALERT_LABEL[blockType as LegacyBlockType];

    if (blockType === "save") {
      const start = new vscode.Position(lineIndex, 0);
      const end = new vscode.Position(lineIndex, lines[lineIndex].length);
      const range = new vscode.Range(start, end);
      const id = `${document.uri.toString()}#${lineIndex}:${blockType}`;

      matches.push({
        id,
        blockType,
        alertLabel,
        replacementLabel: `[!${alertLabel}] blockquote syntax`,
        message: `Legacy \`--- ${blockType} ---\` syntax is deprecated. Use \`> [!${alertLabel}]\` blockquote syntax instead.`,
        range,
        replacement: buildReplacement(blockType, []),
      });
      continue;
    }

    const closeLineIndex = findClosingLineIndex(lines, lineIndex, blockType);
    if (closeLineIndex < 0) {
      continue;
    }

    const contentLines = lines.slice(lineIndex + 1, closeLineIndex);
    const start = new vscode.Position(lineIndex, 0);
    const end = new vscode.Position(
      closeLineIndex,
      lines[closeLineIndex].length,
    );
    const range = new vscode.Range(start, end);
    const id = `${document.uri.toString()}#${lineIndex}:${blockType}`;

    matches.push({
      id,
      blockType,
      alertLabel,
      replacementLabel:
        blockType === "code"
          ? "fenced code block syntax"
          : blockType === "quiz"
            ? "removal (quizzes are deprecated)"
            : `[!${alertLabel}] blockquote syntax`,
      message:
        blockType === "code"
          ? "Legacy `--- code ---` syntax is deprecated. Use fenced code block syntax instead."
          : blockType === "quiz"
            ? "Legacy `--- quiz ---` blocks are deprecated and should be removed."
            : `Legacy \`--- ${blockType} ---\` syntax is deprecated. Use \`> [!${alertLabel}]\` blockquote syntax instead.`,
      range,
      replacement: buildReplacement(blockType, contentLines),
    });

    lineIndex = closeLineIndex;
  }

  return matches;
}
