import pg from 'pg';
import { check, down, migrate, Migration, Migrator, up } from './migrate';
import { colorConsole } from 'tracer';
import { object } from 'zod';

export type DatabaseConfig = {
    user: string;
    host: string;
    database: string;
    password: string;
    port?: number;
};

export type QueryOptions = {
    values?: any[];
    bind?: any;
};

export type DatabaseClient = {
    query: <T extends {}>(query: string, options?: {
        values?: any[]
        bind?: any
    }) => Promise<pg.QueryResult<T>>;
};

export async function connect(config: DatabaseConfig): Promise<DatabaseClient & Migrator & Disposable> {
    const client = (new pg.Client(config));
    await client.connect();

    return {
        [Symbol.dispose]: client.end,
        check: async (migrationsPath: string, version: string) => {
            await check(migrationsPath, client, version);
        },
        up: async (version: string) => {
            await up(version, client);
        },
        down: async (version: string) => {
            await down(version, client);
        },
        migrate: async (to: string) => migrate(to, client),

        query: async <T extends {}>(query: string, options?: {
            values?: any[]
            bind?: any
        }) => {
            if (options?.bind) {
                const keys: { [key: string]: boolean } = {};
                query = query.replace(/(\$\w+)/g, (match, key) => {
                    keys[match] = true;
                    return match;
                });
                query = query.replace(/(\$\w+)/g, (match) => {
                    const key = Object.keys(keys).indexOf(match) + 1;
                    return "$" + key;
                });
                options.values = Object.entries(options.bind)
                    .filter(([key]) => keys[`$` + key])
                    .map(([key, value]) => {
                        return value;
                    });
            }
            try {
                const res = await client.query<T, T[]>(query, options?.values);
                return res;
            } catch (e) {
                colorConsole().error(query, options?.values);
                throw e;
            }
        },
    };
}    