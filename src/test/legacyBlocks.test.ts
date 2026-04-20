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
				'--- /save ---',
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
			].join('\n')
		);

		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(7);
		expect(matches.map((m) => m.alertLabel)).toEqual([
			'TASK',
			'HINT',
			'CHALLENGE',
			'SAVE',
			'NOPRINT',
			'PRINTONLY',
			'ACCORDION',
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
});
