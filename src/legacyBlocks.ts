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
	alertLabel: string;
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
		start += 1;
	}
	while (end > start && lines[end - 1].trim() === '') {
		end -= 1;
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

export function buildReplacement(blockType: string, contentLines: string[]): string {
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
		if (!alertLabel) {
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
			range,
			replacement: buildReplacement(blockType, contentLines),
		});

		lineIndex = closeLineIndex;
	}

	return matches;
}
