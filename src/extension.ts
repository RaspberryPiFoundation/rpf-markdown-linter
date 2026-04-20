import * as vscode from 'vscode';
import { findLegacyBlocks, type LegacyBlockMatch } from './legacyBlocks';

const DIAGNOSTIC_SOURCE = 'rpf-markdown-linter';

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

	const matches = findLegacyBlocks(document);
	const diagnostics = matches.map((match) => {
		const diagnostic = new vscode.Diagnostic(
			match.range,
			`Legacy \`--- ${match.blockType} ---\` syntax is deprecated. Use ${match.replacementLabel} instead.`,
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

	context.subscriptions.push(
		collection,
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
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
		)
	);
}

export function deactivate(): void {}
