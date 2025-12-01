CREATE TABLE "Cache" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Cache_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "name" varchar NOT NULL,
    "value" json NOT NULL,
    CONSTRAINT "Cache_name_unique" UNIQUE("name")
);
