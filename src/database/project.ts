import z from "zod";
import { TableModel, TableModelExtension } from "./TableModel";



export const commit = z.object({
    id: z.string(),
    message: z.string(),
    date: z.date(),
    author: z.string(),
});

export const change = z.object({
    commit: z.string(),
    type: z.string(),
    file: z.string(),
    add: z.number().optional(),
    delete: z.number().optional(),
});

export const log = z.object({
    commit: z.string(),
    repository: z.string(),
    branch: z.string(),
    type: z.string(),
    file: z.string(),
    date: z.date(),
});


export const branch = z.object({
    name: z.string(),
    repository: z.string(),
});

export const branchCommit = z.object({
    commit: z.string(),
    branch: z.string(),
    repository: z.string(),
});

export const repository = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    created: z.date(),
});

export type Commit = z.infer<typeof commit>;
export type Branch = z.infer<typeof branch>;
export type BranchCommit = z.infer<typeof branchCommit>;
export type Repository = z.infer<typeof repository>;
export type Change = z.infer<typeof change>;
export type Log = z.infer<typeof log>;

export type CommitView = Commit & { changes: Change[] };
export type BranchView = Branch & { commits: CommitView[] };
export type RepositoryView = Repository & { branches: { [key: string]: BranchView } };

