import * as child_process from "child_process";
import * as path from "path";
import * as vs from "vscode";
import { Analytics } from "../analytics";
import { LogCategory, LogSeverity } from "../debug/utils";
import { PubGlobal } from "../pub/global";
import { openInBrowser, Sdks } from "../utils";
import { DartDebugSessionInformation, extractObservatoryPort } from "../utils/debug";
import { log, logError, logProcess } from "../utils/log";
import { safeSpawn } from "../utils/processes";
import { pubPath } from "./utils";

const devtools = "devtools";
const devtoolsPackageName = "Dart DevTools";

// By default we'll use port=0 which means it'll be auto-generated by Dart. Once we get a port we'll update
// this variable so that if we restart (eg. a silent extension restart due to SDK change or similar) we will
// try to use the same port, so if the user has browser windows open they're still valid.
// TODO: Allow the user to specify this in a setting so they can use the same/bookmark if they really want (though
// if it's in use that's on them :-))
let portToBind = 0;

export class DevTools implements vs.Disposable {
	private devToolsStatusBarItem = vs.window.createStatusBarItem(vs.StatusBarAlignment.Right, 100);
	private proc: child_process.ChildProcess | undefined;
	/// Resolves to the DevTools URL. This is created immediately when a new process is being spawned so that
	/// concurrent launches can wait on the same promise.
	private devtoolsUrl: Thenable<string> | undefined;

	constructor(private sdks: Sdks, private analytics: Analytics, private pubGlobal: PubGlobal) { }

	/// Spawns DevTools and returns the full URL to open for that session
	///   eg. http://localhost:8123/?port=8543
	public async spawnForSession(session: DartDebugSessionInformation): Promise<{ url: string, dispose: () => void } | undefined> {
		this.analytics.logDebuggerOpenDevTools();

		const isAvailable = await this.pubGlobal.promptToInstallIfRequired(devtoolsPackageName, devtools, undefined, "0.0.6");
		if (!isAvailable) {
			return undefined;
		}

		const observatoryPort = extractObservatoryPort(session.observatoryUri);

		if (!this.devtoolsUrl) {
			this.devtoolsUrl = vs.window.withProgress({
				location: vs.ProgressLocation.Notification,
				title: "Starting Dart DevTools...",
			}, async (_) => this.spawnDevTools());
		}
		try {
			const url = await this.devtoolsUrl;
			const fullUrl = `${url}?port=${observatoryPort}`;
			this.devToolsStatusBarItem.text = "Dart DevTools";
			this.devToolsStatusBarItem.tooltip = `Dart DevTools is running at ${url}`;
			this.devToolsStatusBarItem.command = "dart.openDevTools";
			this.devToolsStatusBarItem.show();
			openInBrowser(fullUrl);
			return { url: fullUrl, dispose: () => this.dispose() };
		} catch (e) {
			this.devToolsStatusBarItem.hide();
			vs.window.showErrorMessage(`${e}`);
		}
	}

	/// Starts the devtools server and returns the URL of the running app.
	private spawnDevTools(): Promise<string> {
		return new Promise((resolve, reject) => {
			const pubBinPath = path.join(this.sdks.dart, pubPath);
			const args = ["global", "run", "devtools", "--machine", "--port", portToBind.toString()];

			const proc = safeSpawn(undefined, pubBinPath, args);
			this.proc = proc;

			const logPrefix = `(PROC ${proc.pid})`;
			log(`${logPrefix} Spawned ${pubBinPath} ${args.join(" ")}`, LogSeverity.Info, LogCategory.CommandProcesses);
			logProcess(LogCategory.CommandProcesses, logPrefix, proc);

			const stdout: string[] = [];
			const stderr: string[] = [];
			this.proc.stdout.on("data", (data) => {
				const output = data.toString();
				stdout.push(output);
				try {
					const evt = JSON.parse(output);
					if (evt.method === "server.started") {
						portToBind = evt.params.port;
						resolve(`http://${evt.params.host}:${evt.params.port}/`);
					}
				} catch {
					console.warn(`Non-JSON output from DevTools: ${output}`);
				}
			});
			this.proc.stderr.on("data", (data) => stderr.push(data.toString()));
			this.proc.on("close", (code) => {
				this.proc = undefined;
				this.devtoolsUrl = undefined;
				this.devToolsStatusBarItem.hide();
				if (code && code !== 0) {
					// Reset the port to 0 on error in case it was from us trying to reuse the previous port.
					portToBind = 0;
					const errorMessage = `${devtoolsPackageName} exited with code ${code}: ${stdout.join("")} ${stderr.join("")}`;
					logError(errorMessage);
					reject(errorMessage);
				} else {
					// We must always compelete the promise in case we didn't match the regex above, else the
					// notification will hang around forever.
					resolve();
				}
			});
		});
	}

	public dispose(): void {
		this.devToolsStatusBarItem.dispose();
		this.devtoolsUrl = undefined;
		if (this.proc && !this.proc.killed) {
			this.proc.kill();
		}
	}
}
