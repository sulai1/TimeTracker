-- Table: public.migrations

CREATE TABLE IF NOT EXISTS public.migrations
(
    id character varying(32) NOT NULL,
    up text COLLATE pg_catalog."default" NOT NULL,
    down text COLLATE pg_catalog."default" NOT NULL,
    installed boolean,
    date date,
    version character varying(16) COLLATE pg_catalog."default",
    CONSTRAINT migrations_pkey PRIMARY KEY (id)
);

ALTER TABLE IF EXISTS public.migrations
    OWNER to postgres;