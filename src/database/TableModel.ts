import { DatabaseClient } from "./database";

export type TableModel<
    Model extends { [P in PK]: unknown },
    PK extends keyof Model,
    Create extends Model = Model,
> = {
    create: (model: Model) => Promise<Create>;
    findByPk: (id: { [P in PK]: Model[P] }) => Promise<Model | null>;
    updateByPk: (id: { [P in PK]: Model[P] }, model: Partial<Create>) => Promise<Model | null>;
    deleteByPk: (id: { [P in PK]: Model[P] }) => Promise<boolean>;
}


export const tableModel = <
    Model extends { [P in PK]: unknown },
    PK extends keyof Model = Extract<keyof Model, "id">,
>(
    database: DatabaseClient,
    table: string,
    columns: (keyof Model)[] = [],
    options: {
        columnNames?: { [P in keyof Partial<Model>]: string }
    } = {}
): TableModel<Model, PK, Model> => {

    function column(column: keyof Model) {
        return `"${String(options.columnNames?.[column] ?? column)}"`;
    }

    function zip(model: Partial<Model>) {
        const cols: (keyof Model)[] = [];
        for (const key in model) {
            if (columns.includes(key) || columns.length === 0) {
                cols.push(key as keyof Model);
            }
        }
        const z = cols.map((name) => { return { bind: `$${String(name)}`, column: column(name), values: model[name] } });
        return z;
    }

    function qv(model: Partial<Model>) {
        const z = zip(model);
        const columnsStr = z.map((x) => x.column).join(", ");
        const valuesStr = z.map((x) => x.bind).join(", ");
        return { columnsStr, valuesStr, values: z.map((x) => x.values) };
    }
    return {
        create: async (model: Model) => {
            const { columnsStr, valuesStr } = qv(model);
            try {
                const res = await database.query(
                    `INSERT INTO ${table} (${columnsStr}) VALUES (${valuesStr}) RETURNING *`,
                    { bind: model }
                );
                return res.rows[0] as Model;
            } catch (e: unknown) {
                if (e && typeof e === "object" && "code" in e) {
                    switch ((e as { code: string }).code) {
                        case "23505":
                            console.warn(e);
                            return {} as Model;
                    }
                    console.error(e);
                    throw e;
                }
            }
            return {} as Model;
        },
        findByPk: async (id: { [P in PK]: Model[P] }) => {
            const r = zip(id as Partial<Model>);
            const match = r.map((x) => x.bind + " = " + x.column).join(" AND ");
            const res = await database.query<Model>(`SELECT * FROM ${table} WHERE ` + match, { bind: id });
            if (res.rows.length > 0) {
                return res.rows[0];
            }
            return null;
        },
        updateByPk: async (id: { [P in PK]: Model[P] }, model: Partial<Model>) => {
            const { columnsStr } = qv(model);
            const res = await database.query(`UPDATE ${table} SET ${columnsStr} WHERE id = $1 RETURNING *`, { bind: model });
            if (res.rows.length > 0) {
                return res.rows[0] as Model;
            }
            return null;
        },
        deleteByPk: async (id: { [P in PK]: Model[P] }) => {
            const res = await database.query(`DELETE FROM ${table} WHERE id = $1`, { values: [id] });
            return (res && res.rowCount) ? res.rowCount > 0 : false;
        }
    };
}