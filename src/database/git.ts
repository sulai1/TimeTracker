import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
const git: SimpleGit = simpleGit().clean(CleanOptions.FORCE);
import fs from "fs";
import { exec } from 'child_process';
import { Commit, Repository, RepositoryView } from './project';

async function gitCommand(command: string, options: { cwd?: string } = { cwd: __dirname }) {
    return await new Promise<string>((resolve, reject) => {
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
}

export async function getGitRepo(dir: string, options: {
    dateFormat?: string
} = {
        dateFormat: "%Y-%m-%d %H:%M:%S"
    }
): Promise<RepositoryView> {

    git.cwd(fs.realpathSync(dir));
    const repoPath = await git.revparse("--show-toplevel");
    const initial = await gitCommand("rev-list --parents HEAD -1");
    const initialCommitId = initial.split(" ")[0];
    const res = await gitCommand(`show --format="%cd %s" --date=format:"${options.dateFormat}" -s ` + initialCommitId, { cwd: repoPath });

    const branch = await gitCommand("rev-parse --abbrev-ref HEAD", { cwd: repoPath });
    const info = res.split(" ");
    const commits = await gitCommand(`log --format="%H_%ce_%s_%cd`, { cwd: repoPath });

    return {
        id: initialCommitId,
        name: repoPath.split("/").pop() || "",
        created: new Date(info[0] + " " + info[1]),
        description: info[2],
        branches:
        {
            [branch]: {
                name: branch,
                repository: initialCommitId,
                commits: commits.split("\n").map((commit: string) => {
                    const c = commit.split("_");
                    return {
                        id: c[0],
                        author: c[1],
                        message: c[2],
                        date: new Date(c[3]),
                    } as Commit;
                })
            },
        },
    };
}


export function GitProject(dir: string) {
    return {
        getRepo: async () => await getGitRepo(dir),
    };
};