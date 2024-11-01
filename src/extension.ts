// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path';
import * as vscode from 'vscode';
import { DatabaseConfig } from './database';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { connect } from './database/database';
import { getGitRepo } from './database/git';

const defaults: DatabaseConfig = {
	user: "postgres",
	host: "localhost",
	database: "postgres",
	password: "",
};

async function init(context: vscode.ExtensionContext) {
	let vscodeDdir = '';
	if (vscode.workspace.workspaceFolders) {
		vscode.window.showInformationMessage('.vscode folder: ' + vscode.workspace.workspaceFolders[0].uri.fsPath);

		vscodeDdir = path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, '.vscode');
		if (!existsSync(vscodeDdir)) {
			mkdir(vscodeDdir, { recursive: true }).catch(async (err) => {
				if (err) {
					vscode.window.showErrorMessage('Failed to create .vscode directory');
				} else {
					vscode.window.showInformationMessage('.vscode directory created');
				}
			});
			return;
		}
		const settings = path.resolve(vscodeDdir, 'settings.json');
		if (!existsSync(settings)) {
			await writeFile(settings, JSON.stringify(defaults), 'utf-8');
		}
		vscode.window.showInformationMessage('wd', vscodeDdir);
	}

	const cfg = vscode.workspace.getConfiguration('tracker');
	let config = cfg.get<DatabaseConfig>('database', defaults);
	let client = null;
	try {
		vscode.window.showInformationMessage('Connected to database');
		client = await connect(config);
	} catch (err) {
		vscode.window.showErrorMessage('Failed to connect to database');
		const options: vscode.InputBoxOptions = {
			prompt: "Enter database user",
			placeHolder: '"postgres"'
		};
		config = { ...defaults };
		const user = await vscode.window.showInputBox(options);
		if (user) { config.user = user; }
		const host = await vscode.window.showInputBox({ prompt: 'Enter database host', placeHolder: 'localhost' });
		if (host) { config.host = host; }

		const database = await vscode.window.showInputBox({ prompt: "Enter database name", placeHolder: 'postgres' });
		if (database) { config.database = database; }

		const password = await vscode.window.showInputBox({ prompt: "Enter database password", placeHolder: '', password: true });
		if (password) {
			config.password = password;
		}

		try {
			client = await connect(config);
			await cfg.update("database", config, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage('Connected to database with new config');
		} catch (err) {
			vscode.window.showErrorMessage('Failed to connect to database with new config');
		}
	};
	if (client) {
		try {
			await client.migrate('1.0.0');
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage('Failed to migrate database', String(err));
		}
	}
	return { vscodeDdir, client };
}

export type EventType = "save" | "create" | "delete" | "open" | "close" | "change" | "start" | "end";

export type Event = {
	time: number,
	type: EventType,
	message: string
}

async function track(dir: string) {

	let repo = await getGitRepo(dir);

	const eventsAkku: Event[] = [];
	function log(type: EventType, message: string) {
		console.log(type, message);
		eventsAkku.push({
			time: Date.now(),
			type,
			message
		});
		if (eventsAkku.length > 100) {
		}
	}
	vscode.workspace.onDidCreateFiles(async (e) => {
		log("create", e.files[0].fsPath);
	});
	vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		log("save", document.fileName);
	});
	vscode.workspace.onDidDeleteFiles(async (e) => {
		log("delete", e.files[0].fsPath);
	});
	vscode.workspace.onDidChangeTextDocument(async (e) => {
		log("change", e.document.fileName);
	});

	//-------------------- window events --------------------//
	vscode.window.onDidStartTerminalShellExecution(async (e) => {
		log("start", e.execution.commandLine.value);
	});
	vscode.window.onDidEndTerminalShellExecution(async (e) => {
		log("end", e.execution.commandLine.value);
	});
}

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
	vscode.window.showInformationMessage('Congratulations, your extension "tracker" is now active!');

	let res = await init(context);
	vscode.commands.registerCommand('tracker.connect', async () => {
		res = await init(context);
	});
	vscode.workspace.onDidChangeConfiguration(async (e) => {
		if (e.affectsConfiguration('tracker.database')) {
			res = await init(context);
		}
	});

	if (res?.vscodeDdir) {
		track(res.vscodeDdir);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {

}
