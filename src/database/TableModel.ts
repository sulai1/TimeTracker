import { DatabaseClient } from "./database";


export type TableModelExtension<Model extends {}, PK extends keyof Model> = TableModel<Model> & {
    /**
     * apply local changes to a store
     * @param model 
     * @param tableModel 
     * @returns 
     */
    sync: (model: Model) => Promise<"insert" | "update" | "get">
    updateByPk: (id: Pick<Model, PK>, model: Partial<Model>) => Promise<boolean>;
    deleteByPk: (id: Pick<Model, PK>) => Promise<boolean>;
    findByPk: (id: Pick<Model, PK>) => Promise<Model | null>;
}

export function tableModelExtension<Model extends {}, PK extends keyof Model>(tm: TableModel<Model>, primaryKey: PK[]): TableModelExtension<Model, PK> {
    const fn = {
        updateByPk: async (id: Pick<Model, PK>, model: Partial<Model>) => {
            const m = {
            } as Partial<Model>;
            for (const key in primaryKey) {
                m[primaryKey[key]] = id[primaryKey[key]];
            }
            const res = await tm.update(model, m);
            return res === 1;
        },
        deleteByPk: async (id: Pick<Model, PK>) => {
            const m = {
            } as Partial<Model>;
            for (const key in primaryKey) {
                m[primaryKey[key]] = id[primaryKey[key]];
            }
            const res = await tm.delete(m);
            return res === 1;
        },
        findByPk: async (id: Pick<Model, PK>) => {
            const m = {
            } as Partial<Model>;
            for (const key in primaryKey) {
                m[primaryKey[key]] = id[primaryKey[key]];
            }
            const res = await tm.find(m);
            if (res.length === 1) {
                return res[0];
            }
            return null;
        }
    };
    return {
        ...tm,
        ...fn,
        sync: async (model: Model) => {
            const existing = await fn.findByPk(model);
            if (existing) {
                const isEqual = primaryKey.every(key => existing[key] === model[key]);
                if (isEqual) {
                    return "get";
                } else {
                    await fn.updateByPk(model, existing);
                    return "update";
                }
            }
            await tm.create(model);
            return "insert";
        },
    };
}

export type TableModel<
    Model extends {}
> = {
    readonly name: string;
    create: (model: Model) => Promise<Model>;
    find: (model: Partial<Model>) => Promise<Model[]>;
    update: (model: Partial<Model>, where: Partial<Model>) => Promise<number>;
    delete: (where: Partial<Model>) => Promise<number>;
}
export const tableModelPK = <Model extends {}, PK extends keyof Model = keyof Model>(
    database: DatabaseClient,
    table: string,
    columns: (keyof Required<Model>)[],
    primaryKey: PK[],
    options: {
        columnNames?: { [P in keyof Partial<Model>]: string }
    } = {}
): TableModelExtension<Model, PK> => {
    return tableModelExtension(tableModel(database, table, columns, options), primaryKey);

};

export const tableModel = <
    Model extends {}
>(
    database: DatabaseClient,
    table: string,
    columns: (keyof Required<Model>)[],
    options: {
        columnNames?: { [P in keyof Partial<Model>]: string }
    } = {}
): TableModel<Model> => {

    function column<T extends keyof Model>(column: T) {
        return `"${String(options.columnNames?.[column] ?? column)}"`;
    }

    function bind(value: unknown, name: string, options?: { prerfix?: string }) {
        switch (typeof value) {
            case "string":
                const date = Date.parse(value);
                if (isNaN(date)) {
                    return `$${name}::text`;
                }
                if (value.includes("T")) {
                    return `$${name}::timestamptz`;
                } else if (value.includes(" ")) {
                    return `$${name}::date`;
                } if (value.includes(":")) {
                    return `$${name}::time`;
                }
                return `$${name}::text`;
            case "number":
                return `$${name}::numeric`;
            case "boolean":
                return `$${name}::boolean`;
            case "object":
                if (value instanceof Date) {
                    return `$${name}::timestamptz`;
                }
                return `$${name}::jsonb`;
        }
        return `$${options?.prerfix ?? ""}${String(name)}`;
    }

    function zip<T extends Extract<keyof Model, string>>(model: Partial<Pick<Model, T>>, options: { prerfix?: string } = { prerfix: "" }) {
        const cols: T[] = [];
        for (const key in model) {
            if (columns.includes(key) || columns.length === 0) {
                cols.push(key as T);
            }
        }
        const z = cols.map((name) => {
            return {
                bind: bind(model[name], name, options), column: column(name), values: model[name]
            };
        });
        return z;
    }

    function qv<T extends Extract<keyof Model, string>>(model: Partial<Pick<Model, T>>) {
        const z = zip(model);
        const columnsStr = z.map((x) => x.column).join(", ");
        const valuesStr = z.map((x) => x.bind).join(", ");
        return { columnsStr, valuesStr, values: z.map((x) => x.values) };
    }

    function buildWhere<T extends Extract<keyof Model, string>>(model: Partial<Pick<Model, T>>) {
        const r = zip(model);
        const match = r.map((x) => x.column + " = " + x.bind).join(" AND ");
        return match;
    }
    function buildSet<T extends Extract<keyof Model, string>>(model: Partial<Pick<Model, T>>) {
        const r = zip(model, { prerfix: "set_" });
        const match = r.map((x) => x.column + " = " + x.bind).join(" , ");
        const obj = {} as { [key: string]: any };
        r.forEach((x) => obj[x.bind.replace("$", "")] = x.values);
        return { match, values: obj };
    }

    const tm: TableModel<Model> = {
        name: table,
        create: async (model: Model) => {
            const { columnsStr, valuesStr } = qv(model);
            try {
                const res = await database.query<Model>(
                    `INSERT INTO ${table} (${columnsStr}) VALUES (${valuesStr})`,
                    { bind: model }
                );
                return res.rows[0];
            } catch (e: unknown) {
                if (e && typeof e === "object" && "code" in e) {
                    console.error(e);
                }
                throw e;
            }
        },
        find: async (model: Partial<Model>) => {
            const match = buildWhere(model);
            const res = await database.query<Model>(`SELECT * FROM ${table} WHERE ` + match, { bind: model });
            return res.rows;
        },
        update: async (model: Partial<Model>, where: Partial<Model>): Promise<number> => {
            const match = buildWhere(where);
            const set = buildSet(model);
            const res = await database.query(`UPDATE ${table} SET ${set.match} WHERE ${match}`, { bind: { ...model, ...set.values } });
            if (res.rows.length > 0) {
                return res.rowCount ?? 0;
            }
            return 0;
        },
        delete: async (where: Partial<Model>): Promise<number> => {
            const match = buildWhere(where);
            const res = await database.query(`DELETE FROM ${table} WHERE ${match}`, { bind: where });
            return res.rowCount ?? 0;
        }
    };
    return tm;
};