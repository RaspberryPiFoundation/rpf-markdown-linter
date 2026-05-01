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
				'',
				'--- quiz ---',
				'---',
				'## question: Example?',
				'- ( ) Yes',
				'--- /quiz ---',
			].join('\n')
		);

		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(9);
		expect(matches.map((m) => m.blockType)).toEqual([
			'task',
			'hint',
			'challenge',
			'save',
			'no-print',
			'print-only',
			'collapse',
			'code',
			'quiz',
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

	it('allows fenced code blocks with valid language and supported attributes', () => {
		const document = createDocument(
			[
				'```python filename="example.py" line_numbers="true" line_number_start="10" line_highlights="11"',
				"print('hello')",
				'```',
			].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(0);
	});

	it('warns when a fenced code block is missing a language', () => {
		const document = createDocument(['```', "print('hello')", '```'].join('\n'));
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('code-fence-language');
		expect(matches[0].message).toContain('valid programming language');
	});

	it('warns when the first fenced code block attribute is not a valid language', () => {
		const document = createDocument(['```filename="example.py" line_numbers="true"', "print('hello')", '```'].join('\n'));
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('code-fence-language');
		expect(matches[0].message).toContain('valid programming language');
	});

	it('warns when fenced code block optional attributes are unsupported', () => {
		const document = createDocument(['```python data-title="Example" line_numbers="true"', "print('hello')", '```'].join('\n'));
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('code-fence-attribute');
		expect(matches[0].message).toContain('filename');
		expect(matches[0].message).toContain('line_highlights');
	});

	it('does not warn for html inside legacy code blocks', () => {
		const document = createDocument(
			['--- code ---', '---', 'language: html', '---', '<div class="tip">content</div>', '--- /code ---'].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('code');
	});

	it('does not warn for default page-break br snippet', () => {
		const document = createDocument('Text before <br class="page-break"/> text after');
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(0);
	});

	it('uses configurable html safelist overrides', () => {
		const allowDiv = ['<div class="tip">'];
		const document = createDocument('<div class="tip">content</div>');
		const matches = findLegacyBlocks(document as never, { allowedHtmlSnippets: allowDiv });
		expect(matches).toHaveLength(0);
	});

	it('converts nested task inside no-print to nested blockquote syntax', () => {
		const output = buildReplacement('no-print', [
			'--- task ---',
			'### Play ▶️',
			'Click sprite one.',
			'--- /task ---',
		]);

		expect(output).toBe(
			'> [!NOPRINT]\n' +
				'>\n' +
				'> > [!TASK]\n' +
				'> >\n' +
				'> > ### Play ▶️\n' +
				'> > Click sprite one.\n'
		);
	});

	it('converts nested hint inside task to nested blockquote syntax', () => {
		const output = buildReplacement('task', [
			'Now, add code to make buttons play sounds.',
			'',
			'--- hint ---',
			'Try adding `btn_cymbal`.',
			'--- /hint ---',
		]);

		expect(output).toBe(
			'> [!TASK]\n' +
				'>\n' +
				'> Now, add code to make buttons play sounds.\n' +
				'>\n' +
				'> > [!HINT]\n' +
				'> >\n' +
				'> > Try adding `btn_cymbal`.\n'
		);
	});

	it('converts grouped hints wrapper into individual hint blocks', () => {
		const document = createDocument(
			['--- hints ---', '--- hint ---', 'Hint 1', '--- /hint ---', '--- /hints ---'].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('hints');
		expect(matches[0].replacement).toBe('> [!HINT]\n>\n> Hint 1\n');
	});

	it('removes hints wrapper and preserves all contained hints', () => {
		const document = createDocument(
			[
				'--- hints ---',
				'--- hint ---',
				'',
				'Hint 1',
				'',
				'--- /hint ---',
				'--- hint ---',
				'Hint 2',
				'',
				'--- /hint ---',
				'--- hint ---',
				'',
				'Hint 3',
				'--- /hint ---',
				'--- hint ---',
				'Hint 4',
				'--- /hint ---',
				'',
				'--- /hints ---',
			].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('hints');
		expect(matches[0].replacement).toBe(
			'> [!HINT]\n' +
				'>\n' +
				'> Hint 1\n' +
				'\n' +
				'> [!HINT]\n' +
				'>\n' +
				'> Hint 2\n' +
				'\n' +
				'> [!HINT]\n' +
				'>\n' +
				'> Hint 3\n' +
				'\n' +
				'> [!HINT]\n' +
				'>\n' +
				'> Hint 4\n'
		);
	});

	it('deprecates quiz blocks with removal quick fix', () => {
		const document = createDocument(
			['--- quiz ---', '---', '## question: Example?', '- ( ) Yes', '--- /quiz ---'].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('quiz');
		expect(matches[0].replacement).toBe('');
		expect(matches[0].replacementLabel).toContain('removal');
	});

	it('detects indented legacy blocks inside numbered list items', () => {
		const document = createDocument(
			[
				'## Step 2 - Test the PIR motion sensor',
				'',
				"1. Open IDLE, create a new file and save it as **parent-detector.py**",
				'',
				'    --- collapse ---',
				'    ---',
				'    title: Opening IDLE',
				'    image: images/idle.png',
				'    ---',
				'',
				'    [[[idle-opening]]]',
				'',
				'    --- /collapse ---',
			].join('\n')
		);
		const matches = findLegacyBlocks(document as never);
		expect(matches).toHaveLength(1);
		expect(matches[0].blockType).toBe('collapse');
		expect(matches[0].replacement).toContain('> [!ACCORDION] Opening IDLE');
	});
});
