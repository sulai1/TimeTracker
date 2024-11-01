import z from "zod";
import { Prettify } from ".";



export const commit = z.object({
    id: z.string(),
    message: z.string(),
    date: z.date(),
    author: z.string(),
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
    description: z.string(),
    created: z.date(),
});

export type Commit = z.infer<typeof commit>;
export type Branch = z.infer<typeof branch>;
export type BranchCommit = z.infer<typeof branchCommit>;
export type Repository = z.infer<typeof repository>;

export type RepositoryView = Repository & { branches: { [key: string]: Branch & { commits: Commit[] } } };