import * as vs from "vscode";

const snippetPattern = new RegExp(/^\/\/\/ {@tool snippet --template=(\w+)}$/gm);

// TODO: How to handle the .1 .2 etc? If it's not in the code, we can't match them up
// (since the index file line numbers may not be reliable)?

export class FlutterSnippetDecorations implements vs.CodeLensProvider, vs.Disposable {
	// TODO: This needs to fire if the user modifies the doc such that snippets are added/removed.
	private onDidChangeCodeLensesEmitter: vs.EventEmitter<void> = new vs.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vs.Event<void> = this.onDidChangeCodeLensesEmitter.event;

	private readonly subscriptions: vs.Disposable[] = [];
	private activeEditor?: vs.TextEditor;
	private readonly activeEditorSnippets: DartDocSnippet[] = [];

	private readonly decorationType = vs.window.createTextEditorDecorationType({
		backgroundColor: new vs.ThemeColor("editor.inactiveSelectionBackground"),
		isWholeLine: true,
		rangeBehavior: vs.DecorationRangeBehavior.ClosedClosed,
	});

	constructor() {
		this.subscriptions.push(vs.window.onDidChangeActiveTextEditor((e) => this.updateDecorations(e)));
		if (vs.window.activeTextEditor)
			this.updateDecorations(vs.window.activeTextEditor);
	}

	private updateDecorations(editor: vs.TextEditor) {
		this.activeEditor = editor;
		this.activeEditorSnippets.length = 0;

		// TODO: config to enable/disable
		if (!editor)
			return;

		const docText = editor.document.getText();

		snippetPattern.lastIndex = 0;
		let match: RegExpExecArray;
		// tslint:disable-next-line: no-conditional-assignment
		while ((match = snippetPattern.exec(docText)) !== null) {
			const id = match[1];
			const range = new vs.Range(editor.document.positionAt(match.index), editor.document.positionAt(match.index + match.length));
			this.activeEditorSnippets.push(new DartDocSnippet(range, id));
		}

		const decorations = this.activeEditorSnippets.map(this.toDecoration);

		editor.setDecorations(this.decorationType, decorations);
	}

	public provideCodeLenses(document: vs.TextDocument, token: vs.CancellationToken): vs.ProviderResult<vs.CodeLens[]> {
		if (this.activeEditor && this.activeEditor.document === document) {
			return this.activeEditorSnippets.map(this.toCodeLens);
		}
	}

	private toDecoration(snippet: DartDocSnippet): vs.DecorationOptions {
		return {
			range: snippet.range,
		};
	}

	private toCodeLens(snippet: DartDocSnippet): vs.CodeLens {
		return new vs.CodeLens(snippet.range, {
			command: "TODO",
			title: "Create Project from Docs sample",
			//tooltip: "...",
		});
	}

	public dispose() {
		this.activeEditor = undefined;
		this.subscriptions.forEach((s) => s.dispose());
	}
}

class DartDocSnippet {
	constructor(public readonly range: vs.Range, public readonly id: string) {
	}
}
