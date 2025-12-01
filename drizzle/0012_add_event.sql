CREATE TABLE "events" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "name" varchar NOT NULL,
    "description" varchar NOT NULL,
    "startTime" timestamp NOT NULL,
    "duration" integer NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
