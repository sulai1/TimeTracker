// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path';
import * as vscode from 'vscode';
import { DatabaseConfig } from './database';
import { connect, DatabaseClient } from './database/database';
import { getGitRepo, RepositoryModels } from './database/git';
import { Migrator } from './database/migrate';
import { Log } from './database/project';

let debug = false;
let client: DatabaseClient & Migrator & Disposable | null = null;
let batchSize = 10;
const defaults: DatabaseConfig = {
	user: "postgres",
	host: "localhost",
	database: "postgres",
	password: "",
};

async function init(context: vscode.ExtensionContext) {
	let vscodeDdir = '';
	if (vscode.workspace.workspaceFolders) {
		if (debug) {
			vscode.window.showInformationMessage('.vscode folder: ' + vscode.workspace.workspaceFolders[0].uri.fsPath);
		}
		vscodeDdir = path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, '.vscode');
	}

	const cfg = vscode.workspace.getConfiguration('tracker');
	let config = cfg.get<DatabaseConfig>('database', defaults);
	debug = cfg.get<boolean>('debug', false);
	batchSize = cfg.get<number>('batchSize', 10);
	try {
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
			if (debug) {
				vscode.window.showInformationMessage('Connected to database');
			}
		} catch (err) {
			vscode.window.showErrorMessage('Failed to connect to database with new config: ', String(err));
		}
	};
	if (client) {
		try {
			if (debug) {
				vscode.window.showInformationMessage('Migrating database');
			}
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
const logs: Log[] = [];
let currentCommit = '';
let currentBranch = '';
let repo: RepositoryModels;

async function commitLogs(repo: RepositoryModels) {
	vscode.window.showInformationMessage('starting logging');
	const start = Date.now();
	currentBranch = await repo.currentBranch();
	currentCommit = await repo.currentCommit();
	if (client) {
		await repo.log(...logs);
		logs.length = 0;
	}
	const end = Date.now();
	const duration = end - start;
	if (debug) {
		vscode.window.showInformationMessage(`Logging took ${duration} milliseconds`);
	}
}

async function track(dir: string, database: DatabaseClient) {
	repo = await getGitRepo(dir, database);
	if (debug) {
		vscode.window.showInformationMessage('Repository connected');
	}

	function log(type: EventType, message: string) {
		if (debug) {
			vscode.window.showInformationMessage(type, message);
		}
		logs.push({
			commit: currentCommit,
			repository: repo.view.id,
			branch: currentBranch,
			type: type,
			file: message,
			date: new Date()
		});
		if (logs.length > batchSize) {
			commitLogs(repo);
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
	// vscode.workspace.onDidChangeTextDocument(async (e) => {
	// 	log("change", e.document.fileName);
	// });

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
	let res = await init(context);
	vscode.commands.registerCommand('tracker.connect', async () => {
		res = await init(context);
	});
	vscode.commands.registerCommand('tracker.sync', async () => {
		repo.sync();
	});

	vscode.workspace.onDidChangeConfiguration(async (e) => {
		if (e.affectsConfiguration('tracker.database')) {
			res = await init(context);
		}
	});

	if (res?.vscodeDdir && res.client) {
		vscode.window.showInformationMessage('Tracker extension is now active');
		track(res.vscodeDdir, res.client);
	}
}

// This method is called when your extension is deactivated
export async function deactivate() {
	if (client) {
		if (repo) {
			await commitLogs(repo);
		}
		await client.end();
	}
}
