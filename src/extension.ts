import * as vscode from 'vscode';
import { findLegacyBlocks, type LegacyBlockMatch } from './legacyBlocks';

const DIAGNOSTIC_SOURCE = 'rpf-markdown-linter';
const CONFIG_SECTION = 'rpfMarkdownLinter';
const HTML_ALLOWLIST_SETTING = 'allowedHtmlSnippets';
const FIX_ALL_KIND = vscode.CodeActionKind.SourceFixAll.append('rpfMarkdownLinter');

function getAllowedHtmlSnippets(uri: vscode.Uri): string[] | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION, uri);
	return config.get<string[]>(HTML_ALLOWLIST_SETTING);
}

function buildEditFromBlockIds(
	document: vscode.TextDocument,
	blockMap: Map<string, LegacyBlockMatch>,
	blockIds: string[]
): vscode.WorkspaceEdit | undefined {
	const fixableBlocks = blockIds
		.map((blockId) => blockMap.get(blockId))
		.filter((block): block is LegacyBlockMatch => Boolean(block?.replacement))
		.sort((a, b) => b.range.start.line - a.range.start.line);

	if (fixableBlocks.length === 0) {
		return undefined;
	}

	const edit = new vscode.WorkspaceEdit();
	for (const block of fixableBlocks) {
		edit.replace(document.uri, block.range, block.replacement!);
	}

	return edit;
}

class LegacyMarkdownQuickFixProvider implements vscode.CodeActionProvider {
	constructor(private readonly blocksByDocument: Map<string, Map<string, LegacyBlockMatch>>) {}

	public provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext
	): vscode.CodeAction[] {
		const blockMap = this.blocksByDocument.get(document.uri.toString());
		if (!blockMap) {
			return [];
		}

		const actions: vscode.CodeAction[] = [];
		for (const diagnostic of context.diagnostics) {
			if (diagnostic.source !== DIAGNOSTIC_SOURCE) {
				continue;
			}

			const diagnosticCode = diagnostic.code;
			const blockId = typeof diagnosticCode === 'string' ? diagnosticCode : undefined;
			if (!blockId) {
				continue;
			}

			const block = blockMap.get(blockId);
			if (!block) {
				continue;
			}
			if (!block.replacement || !block.replacementLabel) {
				continue;
			}

			const action = new vscode.CodeAction(
				`Replace with ${block.replacementLabel}`,
				vscode.CodeActionKind.QuickFix
			);
			action.isPreferred = true;
			action.diagnostics = [diagnostic];

			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, block.range, block.replacement);
			action.edit = edit;
			actions.push(action);
		}

		const fixableDiagnosticIds = context.diagnostics
			.filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE)
			.map((diagnostic) => (typeof diagnostic.code === 'string' ? diagnostic.code : undefined))
			.filter((code): code is string => Boolean(code));

		const fixAllEdit = buildEditFromBlockIds(document, blockMap, fixableDiagnosticIds);
		if (fixAllEdit) {
			const fixAllAction = new vscode.CodeAction(
				'Fix all auto-fixable RPF markdown issues in file',
				FIX_ALL_KIND
			);
			fixAllAction.edit = fixAllEdit;
			actions.push(fixAllAction);
		}

		return actions;
	}
}

function updateDiagnostics(
	document: vscode.TextDocument,
	collection: vscode.DiagnosticCollection,
	blocksByDocument: Map<string, Map<string, LegacyBlockMatch>>
): void {
	if (document.languageId !== 'markdown') {
		return;
	}

	const allowedHtmlSnippets = getAllowedHtmlSnippets(document.uri);
	const matches = findLegacyBlocks(document, { allowedHtmlSnippets });
	const diagnostics = matches.map((match) => {
		const diagnostic = new vscode.Diagnostic(
			match.range,
			match.message,
			vscode.DiagnosticSeverity.Warning
		);
		diagnostic.source = DIAGNOSTIC_SOURCE;
		diagnostic.code = match.id;
		return diagnostic;
	});

	collection.set(document.uri, diagnostics);
	blocksByDocument.set(
		document.uri.toString(),
		new Map(matches.map((match) => [match.id, match]))
	);
}

export function activate(context: vscode.ExtensionContext): void {
	const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
	const blocksByDocument = new Map<string, Map<string, LegacyBlockMatch>>();

	for (const document of vscode.workspace.textDocuments) {
		updateDiagnostics(document, collection, blocksByDocument);
	}

	const fixAllInWorkspaceCommand = vscode.commands.registerCommand(
		'rpf-markdown-linter.fixAllInWorkspace',
		async () => {
			const markdownFiles = await vscode.workspace.findFiles('**/*.md');
			let changedFiles = 0;
			let appliedFixes = 0;

			for (const fileUri of markdownFiles) {
				const document = await vscode.workspace.openTextDocument(fileUri);
				const matches = findLegacyBlocks(document, {
					allowedHtmlSnippets: getAllowedHtmlSnippets(fileUri),
				});
				const blockMap = new Map(matches.map((match) => [match.id, match]));
				const edit = buildEditFromBlockIds(
					document,
					blockMap,
					matches.map((match) => match.id)
				);

				if (!edit) {
					continue;
				}

				const wasApplied = await vscode.workspace.applyEdit(edit);
				if (!wasApplied) {
					continue;
				}

				const didSave = await document.save();
				if (!didSave) {
					continue;
				}

				changedFiles++;
				appliedFixes += matches.filter((match) => Boolean(match.replacement)).length;
				updateDiagnostics(document, collection, blocksByDocument);
			}

			void vscode.window.showInformationMessage(
				`RPF markdown autofix complete: ${appliedFixes} fixes in ${changedFiles} file(s).`
			);
		}
	);

	context.subscriptions.push(
		collection,
		fixAllInWorkspaceCommand,
		vscode.workspace.onDidOpenTextDocument((document) => {
			updateDiagnostics(document, collection, blocksByDocument);
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			updateDiagnostics(event.document, collection, blocksByDocument);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			collection.delete(document.uri);
			blocksByDocument.delete(document.uri.toString());
		}),
		vscode.languages.registerCodeActionsProvider(
			{ language: 'markdown' },
			new LegacyMarkdownQuickFixProvider(blocksByDocument),
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, FIX_ALL_KIND] }
		)
	);
}

export function deactivate(): void {}
