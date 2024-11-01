
export type UUID = string;

export type Version = `${string}_${number}.${number}.${number}`;

export type Prettify<T> = {
    [P in keyof T]: T[P];
} & {}

export type Disposable<T> = Prettify<T> & {
    [Symbol.dispose]: () => Promise<void>
}

export function disposable<T>(value: T, dispose: (value: T) => Promise<void>): Disposable<T> {
    return {
        ...value,
        [Symbol.dispose]: () => dispose(value)
    };
}

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