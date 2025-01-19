import pg from 'pg';
import { colorConsole } from 'tracer';
import { check, down, migrate, Migrator, up } from './migrate';

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
    end: () => Promise<void>;
};

export async function connect(config: DatabaseConfig, options?: { debug?: boolean }): Promise<DatabaseClient & Migrator & Disposable> {
    const debug = options?.debug;
    const client = (new pg.Client(config));
    await client.connect();

    return {
        [Symbol.dispose]: client.end,
        end: client.end,
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
                if (debug) {
                    colorConsole().info(query, options?.values);
                }
                const res = await client.query<T, T[]>(query, options?.values);
                return res;
            } catch (e) {

                colorConsole().error(query, options?.values);
                throw e;
            }
        },
    };
}    