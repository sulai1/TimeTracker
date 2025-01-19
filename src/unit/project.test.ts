import simpleGit, { CleanOptions, SimpleGit } from "simple-git";
import { connect, DatabaseClient } from "../database/database";
import { getGitRepo, RepositoryModels } from "../database/git";
import { Branch, BranchCommit, Change, commit, Commit, Repository, RepositoryView } from "../database/project";
import z from "zod";
import { tableModel, tableModelPK } from "../database/TableModel";
const { expect } = require("chai");
const git: SimpleGit = simpleGit().clean(CleanOptions.FORCE);

const key = "1".repeat(40);
const repos: RepositoryView[] = [
    {
        created: new Date(),
        description: "initial",
        id: key,
        name: "test",
        branches: {
            main: {
                name: "main",
                repository: key,
                commits: [
                    {
                        author: "me", date: new Date(), id: key, message: "hello", changes: [
                            { add: 1, commit: key, delete: 0, file: "test.txt", type: "A" },
                        ]
                    },
                ],
            }
        }
    }
];

describe('Repository test', () => {
    let database: DatabaseClient;
    before(async () => {
        database = await connect({
            database: "tracker",
            host: "192.168.0.6",
            password: "sbg631587",
            user: "postgres",
        });
    });
    after(async () => {
        await database.query("delete from branch_commit where repository = $1;", { values: [key] });
        await database.query("delete from branch where repository = $1;", { values: [key] });
        await database.query("delete from repository where id = $1;", { values: [key] });
        await database.query("delete from commit where id = $1;", { values: [key] });
        await database.query("delete from change where commit = $1;", { values: [key] });
    });
    it('should pass', async function () {
        this.timeout(10000);
        const model = await getGitRepo(__dirname, database);
        const repo = model.view;
        expect(repo.id).to.be.a("string");
        expect(repo.description).to.equal("initial");
    });

    it('report', async function () {
        this.timeout(10000);
        const models: RepositoryModels["models"] = {
            Branch: tableModelPK(database, "branch", ["repository", "name"], ["repository", "name"]),
            BranchCommit: tableModelPK(database, "branch_commit", ["repository", "branch", "commit"], ["repository", "branch", "commit"]),
            Change: tableModelPK(database, "change", ["file", "commit", "add", "delete", "type"], ["file", "commit"]),
            Commit: tableModelPK(database, "commit", ["id", "message", "date", "author"], ["id"]),
            Repository: tableModelPK(database, "repository", ["id", "name", "created", "description"], ["id"]),
            Log: tableModel(database, "log", ["commit", "repository", "branch", "type", "file", "date"]),
        };
        try {
            for (const repo of repos) {
                await models.Repository.create(repo);
                const retrievedRepo = await models.Repository.findByPk(repo);
                const r = { ...repo } as { branches?: unknown, created?: Date };
                delete r.branches;
                delete r.created;
                for (const branchName in repo.branches) {
                    const branch = repo.branches[branchName];
                    await models.Branch.create(branch);
                    const retrievedBranch = await models.Branch.findByPk({ name: branchName, repository: key });
                    const b = { ...branch } as { commits?: Commit[] };
                    delete b.commits;
                    expect(b).to.deep.equal(retrievedBranch);
                    for (const commit of branch.commits) {
                        await models.Commit.create(commit);

                        const c = await models.Commit.findByPk({ id: commit.id }) as Omit<typeof commit, "date"> & { date?: Date };
                        delete c.date;
                        expect(c).to.deep.equal({
                            id: commit.id,
                            message: commit.message,
                            author: commit.author,
                        });
                        await models.BranchCommit.create({ commit: key, branch: branch.name, repository: key });
                        const nbc = await models.BranchCommit.findByPk({ commit: commit.id, branch: branchName, repository: key });
                        expect(nbc).to.deep.equal({
                            commit: key,
                            branch: branch.name,
                            repository: key,
                        });
                        for (const change of commit.changes) {
                            await models.Change.create(change);
                            const nc = await models.Change.findByPk({ file: change.file, commit: key });
                            expect(nc).to.deep.equal({
                                file: change.file,
                                commit: change.commit,
                                add: change.add,
                                delete: change.delete,
                                type: change.type,
                            });
                        }
                    }
                }
            }

        } catch (e) {
            console.error(e);
            throw e;
        }
    });
});