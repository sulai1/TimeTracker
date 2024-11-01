import { readdir, readFile } from "fs/promises";
import path from "path";
import { Client } from "pg";
import z from "zod";
import { Prettify } from ".";
import packageJson from '../../package.json';


export const MigrationSchema = z.object({
    id: z.string(),
    version: z.string(),
    up: z.string(),
    down: z.string(),
    date: z.date(),
});

export type Migration = Prettify<z.infer<typeof MigrationSchema>>;

export type Migrator = {
    check: (migrationsPath: string, version: string) => Promise<void>;
    up: (version: string) => Promise<void>;
    down: (version: string) => Promise<void>;
    migrate: (version: string) => Promise<void>;
}

async function parseMigration(text: string): Promise<string[]> {
    const parts = [];
    for (let part of text.split("--")) {
        const lines = part.split('\n');
        lines.shift();
        part = lines.join('\n');
        if (part.trim()) {
            if (!part.trim().toLowerCase().startsWith('create function') && !part.trim().toLowerCase().startsWith('create procedure')) {
                const statements = part.split(';').filter(statement => statement.trim());
                parts.push(...statements);
            } else {
                parts.push(part);
            }
        }
    }
    return parts;
}

export async function check<T extends Client>(migrationsPath: string, database: T, version: string) {
    const knownMigrations = await database.query(`SELECT id FROM migrations`);

    const migrationsFromFiles = await readdir(migrationsPath);
    const up = migrationsFromFiles.filter((file) => {
        return file.endsWith('up.sql');
    });
    const down = migrationsFromFiles.filter((file) => {
        return file.endsWith('down.sql');
    });
    if ((up.length !== down.length)) {
        throw new Error('Missing up or down migration');
    }
    if (up.length === 0) {
        throw new Error('Init migration not found');
    }
    const upText = await readFile(path.resolve(__dirname, 'migrations', up[0]), 'utf-8');
    // Execute the initial migration

    for (const q of await parseMigration(upText)) {
        try {
            await database.query(q);
        } catch (e) {
            console.error(e);
        }
    }
    for (let i = 0; i < up.length; i++) {

        const upText = await readFile(path.resolve(__dirname, 'migrations', up[i]), 'utf-8');
        const downText = await readFile(path.resolve(__dirname, 'migrations', down[i]), 'utf-8');
        const id = path.basename(up[i]).replace('.up.sql', '');
        if (!knownMigrations.rows.find((m: Migration) => m.id === id)) {
            await database.query(
                `INSERT INTO migrations (id, version, up, down, date) VALUES ($1, $2, $3, $4, $5)`,
                [id, version, upText, downText, new Date()],
            );
        }
    }
}

export async function up(version: string, client: Client): Promise<void> {
    const res = await client.query(`Select * from migrations where version <= $1 and COALESCE(installed,false)=false`, [version]);
    for (const migration of res.rows) {
        for (const q of await parseMigration(migration.up)) {
            try {
                await client.query(q);
            }
            catch (e) {
                console.error(e);
            }
        }
    }
}

export async function down(version: string, client: Client): Promise<void> {
    const res = await client.query(`Select * from migrations where version > $1 and COALESCE(installed,false)=true`, [version]);
    for (const migration of res.rows) {
        for (const q of await parseMigration(migration.up)) {
            try {
                await client.query(q);
            }
            catch (e) {
                console.error(e);
            }
        }
    }
}

export async function migrate(version: string, client: Client): Promise<void> {
    await check(path.resolve(__dirname, 'migrations'), client, packageJson.version);
    await up(version, client);
    await down(version, client);
}
export async function createMigrator<T extends Client>(client: T): Promise<Migrator> {
    return {
        check: async (migrationsPath: string, version: string) => {
            await check(migrationsPath, client, version);
        },
        up: async (version: string) => {
            await up(version, client);
        },
        down: async (version: string) => {
            await down(version, client);
        },
        migrate: async (version: string) => {
            await migrate(version, client);
        },
    };
}