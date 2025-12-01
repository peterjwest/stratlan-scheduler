CREATE TABLE "Lan" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Lan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "name" varchar NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL
);
