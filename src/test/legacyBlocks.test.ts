import { describe, expect, it } from 'vitest';
import { buildReplacement, findLegacyBlocks } from '../legacyBlocks';

interface MockDocument {
	uri: { toString(): string };
	getText(): string;
}

function createDocument(content: string): MockDocument {
	return {
		uri: { toString: () => 'file:///example.md' },
		getText: () => content,
	};
}

describe('legacyBlocks', () => {
	it('finds all supported legacy block types', () => {
		const document = createDocument(
			[
				'--- task ---',
				'Do this.',
				'--- /task ---',
				'',
				'--- hint ---',
				'Try that.',
				'--- /hint ---',
				'',
				'--- challenge ---',
				'Challenge text',
				'--- /challenge ---',
				'',
				'--- save ---',
				'',
				'--- no-print ---',
				'Invisible in print',
				'--- /no-print ---',
				'',
				'--- print-only ---',
				'Visible in print',
				'--- /print-only ---',
				'',
				'--- collapse ---',
				'Inside collapse',
				'--- /collapse ---',
				'',
				'--- code ---',
				'---',
				'language: python',
				'line_numbers: true',
				'line_number_start: 10',
				'line_highlights: 11',
				'---',
				"print('hello')",
				'--- /code ---',
			].join('\n')
		);

		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(8);
		expect(matches.map((m) => m.blockType)).toEqual([
			'task',
			'hint',
			'challenge',
			'save',
			'no-print',
			'print-only',
			'collapse',
			'code',
		]);
		expect(matches.map((m) => m.alertLabel)).toEqual([
			'TASK',
			'HINT',
			'CHALLENGE',
			'SAVE',
			'NOPRINT',
			'PRINTONLY',
			'ACCORDION',
			undefined,
		]);
	});

	it('does not match modern blockquote syntax', () => {
		const document = createDocument('# Title\n\n> [!TASK]\n>\n> Already migrated.\n');
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(0);
	});

	it('builds expected replacement for task blocks', () => {
		const output = buildReplacement('task', ['', 'Line one', 'Line two', '']);
		expect(output).toBe('> [!TASK]\n>\n> Line one\n> Line two\n');
	});

	it('matches standalone save line without closing block', () => {
		const document = createDocument('Before\n--- save ---\nAfter');
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('save');
		expect(matches[0].replacement).toBe('> [!SAVE]\n');
	});

	it('ignores orphan closing save block marker', () => {
		const document = createDocument('Before\n--- /save ---\nAfter');
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(0);
	});

	it('includes collapse title when metadata is present', () => {
		const output = buildReplacement('collapse', [
			'',
			'---',
			'title: Install software',
			'---',
			'',
			'Do this first.',
		]);

		expect(output).toBe('> [!ACCORDION] Install software\n>\n> Do this first.\n');
	});

	it('converts legacy code block metadata to fenced code attributes', () => {
		const output = buildReplacement('code', [
			'---',
			'language: python',
			'line_numbers: true',
			'line_number_start: 10',
			'line_highlights: 11',
			'---',
			'',
			"print('hello')",
		]);

		expect(output).toBe(
			'```python line_numbers="true" line_number_start="10" line_highlights="11"\n' +
				"print('hello')\n" +
				'```\n'
		);
	});

	it('warns for html outside code contexts', () => {
		const document = createDocument('Hello <div class="tip">content</div>');
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('html');
		expect(matches[0].replacement).toBeUndefined();
	});

	it('does not warn for html inside fenced code blocks', () => {
		const document = createDocument(['```html', '<div class="tip">content</div>', '```'].join('\n'));
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(0);
	});

	it('does not warn for html inside legacy code blocks', () => {
		const document = createDocument(
			['--- code ---', '---', 'language: html', '---', '<div class="tip">content</div>', '--- /code ---'].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('code');
	});
});
