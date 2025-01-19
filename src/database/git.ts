import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import fs, { realpath } from "fs";
import { exec } from 'child_process';
import { Branch, BranchCommit, Change, Commit, CommitView, Log, Repository, RepositoryView } from './project';
import { DatabaseClient } from './database';
import { tableModel, TableModel, TableModelExtension, tableModelPK as tableModelPK } from './TableModel';
import { resolve } from 'path';

export type RepositoryModels = {
    readonly models: {
        Commit: TableModelExtension<Commit, "id">,
        Repository: TableModelExtension<Repository, "id">,
        Branch: TableModelExtension<Branch, "repository" | "name">,
        BranchCommit: TableModelExtension<BranchCommit, "repository" | "branch" | "commit">,
        Change: TableModelExtension<Change, "file" | "commit">,
        Log: TableModel<Log>,
    }
    readonly view: RepositoryView,
    currentBranch(): Promise<string>,
    currentCommit(): Promise<string>,
    log: (...log: Log[]) => Promise<void>;
    sync: () => Promise<void>;
};

async function gitCommand(command: string, options: { cwd?: string } = { cwd: __dirname }): Promise<string> {
    try {

        const res = await new Promise<string>((resolve, reject) => {
            exec(`git ` + command,
                { cwd: options.cwd },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(stdout.trim());
                    }
                }
            );
        });
        return res;
    } catch (err) {
        return String(err);
    }
}

export async function getCommit(id: string, author: string, message: string, date: Date, options?: { cwd: string }): Promise<CommitView> {
    const change_res = await gitCommand(`show --name-status --format="" ${id}`, { cwd: options?.cwd });
    const changes = [] as Change[];
    for (const change of change_res.split("\n")) {
        const [type, file] = change.split("\t");

        if (file) {
            if (type.startsWith("R")) {
                changes.push({ commit: id, type, file, add: 1, delete: 1 });
            } else if (type.startsWith("C")) {
                changes.push({ commit: id, type, file, add: 1, delete: 0 });
            } else if (["A", "M", "D"].includes(type)) {
                const stat_res = await gitCommand(`show --format="" --numstat ${id} -- "${file}"`, { cwd: options?.cwd });
                const [add, del] = stat_res.split("\t");
                const addN = parseInt(add);
                const delN = parseInt(del);
                if (isNaN(addN) || isNaN(delN)) {
                    changes.push({ commit: id, type, file, add: 0, delete: 0 });
                }
                changes.push({ commit: id, type, file, add: addN, delete: delN });
            } else {
                changes.push({ commit: id, type, file, add: 0, delete: 0 });
            }
        }
    }
    return {
        id,
        author,
        message,
        date,
        changes
    };
}

async function buildTree(repoPath: string, options: { dateFormat: string }) {
    const initial = (await gitCommand("log --reverse --format=%H", { cwd: repoPath })).split("\n")[0];
    const initialCommitId = initial.split("\n")[0];
    const res = await gitCommand(`show --format="%cd %s" --date=format:"${options.dateFormat}" -s ` + initialCommitId, { cwd: repoPath });

    const branch = await gitCommand("rev-parse --abbrev-ref HEAD", { cwd: repoPath });
    const info = res.split(" ");
    const c_res = await gitCommand(`log --format="%H_%ce_%s_%cd`, { cwd: repoPath });
    const commits = [] as CommitView[];

    for (const commit of c_res.split("\n")) {
        commits.push(await getCommit(commit.split("_")[0], commit.split("_")[1], commit.split("_")[2], new Date(commit.split("_")[3]), { cwd: repoPath }));
    }
    const view = {
        id: initialCommitId,
        name: repoPath.split("/").pop() || "",
        created: new Date(info[0] + " " + info[1]),
        description: info[2],
        branches:
        {
            [branch]: {
                name: branch,
                repository: initialCommitId,
                commits: commits,
            },
        },
    };
    return view;
}
export async function getGitRepo(dir: string, database: DatabaseClient, options: {
    dateFormat?: string
} = {
        dateFormat: "%Y-%m-%d %H:%M:%S"
    }
): Promise<RepositoryModels> {
    let currentBranch = "";
    let currentCommit = "";

    const repoPath = await gitCommand("rev-parse --show-toplevel", { cwd: dir });

    const models = {
        Commit: tableModelPK(database, "commit", ["id", "message", "date", "author"], ["id"]),
        Repository: tableModelPK(database, "repository", ["id", "name", "created", "description"], ["id"]),
        Branch: tableModelPK(database, "branch", ["repository", "name"], ["repository", "name"]),
        BranchCommit: tableModelPK(database, "branch_commit", ["repository", "branch", "commit"], ["repository", "branch", "commit"]),
        Change: tableModelPK(database, "change", ["file", "commit", "add", "delete", "type"], ["file", "commit"]),
        Log: tableModel(database, "log", ["commit", "repository", "branch", "type", "file", "date"]),
    } as RepositoryModels["models"];
    let view = await buildTree(repoPath, { dateFormat: options.dateFormat || "%Y-%m-%d %H:%M:%S" });
    return {
        currentBranch: async () => {
            const branch = await gitCommand("rev-parse --abbrev-ref HEAD", { cwd: repoPath });
            // if (branch === currentBranch) {
            //     return branch;
            // }
            // view = await buildTree(repoPath, { dateFormat: options.dateFormat || "%Y-%m-%d %H:%M:%S" });
            return currentBranch = branch;
        },
        currentCommit: async () => {
            const commit = await gitCommand("rev-parse HEAD", { cwd: repoPath });
            // if (commit === currentCommit) {
            //     return commit;
            // }
            // view = await buildTree(repoPath, { dateFormat: options.dateFormat || "%Y-%m-%d %H:%M:%S" });
            return currentCommit = commit;
        },
        log: async (...logs: Log[]) => {
            for (const log of logs) {
                models.Log.create(log);
            }
        },
        sync: async () => {
            view = await buildTree(repoPath, { dateFormat: options.dateFormat || "%Y-%m-%d %H:%M:%S" });
            await models.Repository.sync(view);
            for (const branch in view.branches) {
                const b = view.branches[branch];
                await models.Branch.sync(b);
                for (const commit of b.commits) {
                    await models.Commit.sync(commit);
                    await models.BranchCommit.sync({ commit: commit.id, branch: b.name, repository: view.id });
                    for (const change of commit.changes) {
                        await models.Change.sync(change);
                    }
                }
            }
        },
        models,
        get view() {
            return view;
        }
    };
}
