import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vs from "vscode";
import { FlutterSampleSnippet } from "../../../src/commands/sdk";
import { FLUTTER_CREATE_PROJECT_TRIGGER_FILE, fsPath } from "../../../src/utils";
import { ext, getRandomTempFolder, sb } from "../../helpers";

describe("test environment", () => {
	it("has opened the correct folder", () => {
		const wfs = vs.workspace.workspaceFolders || [];
		assert.equal(wfs.length, 1);
		assert.ok(
			fsPath(wfs[0].uri).endsWith(path.sep + "empty"),
			`${fsPath(wfs[0].uri)} doesn't end with ${path.sep}empty`,
		);
	});
});

describe("extension", () => {
	it("did not activate", async () => {
		assert.equal(ext.isActive, false);
	});
});

// Note: We can only really have one "real" test here because it'll activate the extension.
// Other tests must go in their own folders and be listed in test_all/launch.json individually.

describe("command", () => {
	it("Flutter: New Project can be invoked and creates trigger file", async () => {
		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("my_test_flutter_proj");

		const showOpenDialog = sb.stub(vs.window, "showOpenDialog");
		const tempFolder = getRandomTempFolder();
		showOpenDialog.resolves([vs.Uri.file(tempFolder)]);

		// Intercept executeCommand for openFolder so we don't spawn a new instance of Code!
		const executeCommand = sb.stub(vs.commands, "executeCommand").callThrough();
		const openFolder = executeCommand.withArgs("vscode.openFolder", sinon.match.any).resolves();

		await vs.commands.executeCommand("flutter.createProject");

		assert.ok(showInputBox.calledOnce);
		assert.ok(showOpenDialog.calledOnce);
		assert.ok(openFolder.calledOnce);
		assert.ok(fs.existsSync(path.join(tempFolder, "my_test_flutter_proj", FLUTTER_CREATE_PROJECT_TRIGGER_FILE)));
	});

	it("Flutter: Create Sample Project can be invoked and creates trigger file", async () => {
		const sampleID = "material.IconButton";
		const showQuickPick = sb.stub(vs.window, "showQuickPick");
		type SnippetOption = vs.QuickPickItem & { snippet: FlutterSampleSnippet };
		showQuickPick.callsFake((items: SnippetOption[]) => items.find((s) => s.snippet.id === sampleID));

		// Intercept executeCommand for openFolder so we don't spawn a new instance of Code!
		const executeCommand = sb.stub(vs.commands, "executeCommand").callThrough();
		const openFolder = executeCommand.withArgs("vscode.openFolder", sinon.match.any).resolves();

		const sampleFolderUri: string = await vs.commands.executeCommand("_dart.flutter.createSampleProject");

		assert.ok(showQuickPick.calledOnce);
		assert.ok(openFolder.calledOnce);
		const triggerFile = path.join(fsPath(sampleFolderUri), FLUTTER_CREATE_PROJECT_TRIGGER_FILE);
		assert.ok(fs.existsSync(triggerFile));
		const recordedSampleId = fs.readFileSync(triggerFile).toString().trim();
		assert.equal(recordedSampleId, sampleID);
	});
});
