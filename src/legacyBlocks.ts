import * as vscode from 'vscode';

const BLOCK_TYPE_TO_ALERT_LABEL: Record<string, string> = {
	task: 'TASK',
	hint: 'HINT',
	challenge: 'CHALLENGE',
	save: 'SAVE',
	'no-print': 'NOPRINT',
	'print-only': 'PRINTONLY',
	collapse: 'ACCORDION',
};

export interface LegacyBlockMatch {
	id: string;
	blockType: string;
	alertLabel?: string;
	replacementLabel: string;
	range: vscode.Range;
	replacement: string;
}

const OPEN_BLOCK_PATTERN = /^---\s*([a-z-]+)\s*---\s*$/i;

function quoteLines(lines: string[]): string[] {
	return lines.map((line) => (line.length === 0 ? '>' : `> ${line}`));
}

function stripOuterBlankLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim() === '') {
		start++;
	}
	while (end > start && lines[end - 1].trim() === '') {
		end--;
	}
	return lines.slice(start, end);
}

function parseCollapseMetadata(contentLines: string[]): { title?: string; bodyLines: string[] } {
	const firstNonEmptyIndex = contentLines.findIndex((line) => line.trim().length > 0);
	if (firstNonEmptyIndex < 0) {
		return { bodyLines: [] };
	}

	if (contentLines[firstNonEmptyIndex].trim() !== '---') {
		return { bodyLines: contentLines };
	}

	let metadataEndIndex = -1;
	for (let i = firstNonEmptyIndex + 1; i < contentLines.length; i += 1) {
		if (contentLines[i].trim() === '---') {
			metadataEndIndex = i;
			break;
		}
	}

	if (metadataEndIndex < 0) {
		return { bodyLines: contentLines };
	}

	const metadataLines = contentLines.slice(firstNonEmptyIndex + 1, metadataEndIndex);
	const titleLine = metadataLines.find((line) => line.trim().toLowerCase().startsWith('title:'));
	const parsedTitle = titleLine?.split(':').slice(1).join(':').trim();

	const bodyLines = contentLines.slice(metadataEndIndex + 1);
	return {
		title: parsedTitle && parsedTitle.length > 0 ? parsedTitle : undefined,
		bodyLines,
	};
}

function parseCodeMetadata(contentLines: string[]): { attributes: string[]; bodyLines: string[] } {
	const firstNonEmptyIndex = contentLines.findIndex((line) => line.trim().length > 0);
	if (firstNonEmptyIndex < 0) {
		return { attributes: [], bodyLines: [] };
	}

	if (contentLines[firstNonEmptyIndex].trim() !== '---') {
		return { attributes: [], bodyLines: contentLines };
	}

	let metadataEndIndex = -1;
	for (let i = firstNonEmptyIndex + 1; i < contentLines.length; i += 1) {
		if (contentLines[i].trim() === '---') {
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
		const separatorIndex = line.indexOf(':');
		if (separatorIndex <= 0) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key.length === 0 || value.length === 0) {
			continue;
		}

		if (key === 'language') {
			continue;
		}

		attributes.push(`${key}="${value}"`);
	}

	return { attributes, bodyLines };
}

export function buildReplacement(blockType: string, contentLines: string[]): string {
	if (blockType === 'code') {
		const { attributes, bodyLines } = parseCodeMetadata(contentLines);
		const normalizedBody = stripOuterBlankLines(bodyLines);
		const languageMetadataLine = contentLines
			.map((line) => line.trim())
			.find((line) => line.toLowerCase().startsWith('language:'));
		const language = languageMetadataLine?.split(':').slice(1).join(':').trim() ?? '';
		const infoStringParts = [language, ...attributes].filter((part) => part.length > 0);
		const openingFence = `\`\`\`${infoStringParts.join(' ')}`.trimEnd();
		return [openingFence, ...normalizedBody, '```', ''].join('\n');
	}

	const alertLabel = BLOCK_TYPE_TO_ALERT_LABEL[blockType];
	if (!alertLabel) {
		return contentLines.join('\n');
	}

	let title: string | undefined;
	let bodyLines = contentLines;

	if (blockType === 'collapse') {
		const collapseData = parseCollapseMetadata(contentLines);
		title = collapseData.title;
		bodyLines = collapseData.bodyLines;
	}

	const normalizedBody = stripOuterBlankLines(bodyLines);
	const header = title ? `> [!${alertLabel}] ${title}` : `> [!${alertLabel}]`;

	if (normalizedBody.length === 0) {
		return `${header}\n`;
	}

	const quotedBody = quoteLines(normalizedBody);
	return [header, '>', ...quotedBody, ''].join('\n');
}

export function findLegacyBlocks(document: vscode.TextDocument): LegacyBlockMatch[] {
	const lines = document.getText().split(/\r?\n/);
	const matches: LegacyBlockMatch[] = [];

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const openMatch = lines[lineIndex].match(OPEN_BLOCK_PATTERN);
		if (!openMatch) {
			continue;
		}

		const blockType = openMatch[1].toLowerCase();
		const alertLabel = BLOCK_TYPE_TO_ALERT_LABEL[blockType];
		if (!alertLabel && blockType !== 'code') {
			continue;
		}

		if (blockType === 'save') {
			const start = new vscode.Position(lineIndex, 0);
			const end = new vscode.Position(lineIndex, lines[lineIndex].length);
			const range = new vscode.Range(start, end);
			const id = `${document.uri.toString()}#${lineIndex}:${blockType}`;

			matches.push({
				id,
				blockType,
				alertLabel,
				replacementLabel: `[!${alertLabel}] blockquote syntax`,
				range,
				replacement: buildReplacement(blockType, []),
			});
			continue;
		}

		const closePattern = new RegExp(`^---\\s*\\/\\s*${blockType}\\s*---\\s*$`, 'i');
		let closeLineIndex = -1;
		for (let i = lineIndex + 1; i < lines.length; i += 1) {
			if (closePattern.test(lines[i])) {
				closeLineIndex = i;
				break;
			}
		}

		if (closeLineIndex < 0) {
			continue;
		}

		const contentLines = lines.slice(lineIndex + 1, closeLineIndex);
		const start = new vscode.Position(lineIndex, 0);
		const end = new vscode.Position(closeLineIndex, lines[closeLineIndex].length);
		const range = new vscode.Range(start, end);
		const id = `${document.uri.toString()}#${lineIndex}:${blockType}`;

		matches.push({
			id,
			blockType,
			alertLabel,
			replacementLabel: blockType === 'code' ? 'fenced code block syntax' : `[!${alertLabel}] blockquote syntax`,
			range,
			replacement: buildReplacement(blockType, contentLines),
		});

		lineIndex = closeLineIndex;
	}

	return matches;
}
