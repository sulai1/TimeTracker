import simpleGit, { CleanOptions, SimpleGit } from "simple-git";
import { connect, DatabaseClient } from "../database/database";
import { getGitRepo } from "../database/git";
import { Branch, BranchCommit, commit, Commit, Repository, RepositoryView } from "../database/project";
import { tableModel } from "../database/TableModel";
import z from "zod";
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
            master: {
                name: "master",
                repository: key,
                commits: [
                    { author: "me", date: new Date(), id: key, message: "hello" }
                ],
            }
        }
    }
]

describe('Dummy test', () => {
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
    });
    it('should pass', async () => {
        const repo = await getGitRepo(__dirname);
        expect(repo.id).to.be.a("string");
        expect(repo.description).to.equal("initial");
    });
    it('report', async () => {

        const tm = tableModel<Commit>(database, "commit", ["id", "message", "date", "author"]);
        const pj = tableModel<Repository, "id">(database, "repository", ["id", "name", "description", "created"]);
        const br = tableModel<Branch, "repository" | "name">(database, "branch", ["repository", "name"]);
        const bc = tableModel<BranchCommit, "repository" | "branch" | "commit">(database, "branch_commit", ["repository", "branch", "commit"]);
        try {
            for (const repo of repos) {
                pj.create(repo);
                const retrievedRepo = await pj.findByPk(repo);
                const r = { ...repo } as { branches?: unknown, created?: Date };
                delete r.branches;
                delete r.created;
                for (const branchName in repo.branches) {
                    const branch = repo.branches[branchName];
                    br.create(branch);
                    const retrievedBranch = await br.findByPk({ name: branchName, repository: key });
                    const b = { ...branch } as { commits?: Commit[] };
                    delete b.commits;
                    expect(b).to.deep.equal(retrievedBranch);
                    for (const commit of branch.commits) {
                        tm.create(commit);

                        const c = await tm.findByPk({ id: commit.id }) as Omit<typeof commit, "date"> & { date?: Date };
                        delete c.date;
                        expect(c).to.deep.equal({
                            id: commit.id,
                            message: commit.message,
                            author: commit.author,
                        });
                        bc.create({ commit: key, branch: branch.name, repository: key });
                        expect(await bc.findByPk({ commit: commit.id, branch: branchName, repository: key })).to.deep.equal({
                            commit: key,
                            branch: branch.name,
                            repository: key,
                        });
                    }
                }
            }

        } catch (e) {
            console.error(e);
            throw e;
        }
    });
});