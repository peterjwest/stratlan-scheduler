CREATE TABLE "EventTimeslot" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "EventTimeslot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "eventId" integer NOT NULL,
    "time" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "EventTimeslot" ADD CONSTRAINT "EventTimeslot_eventId_Event_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE no action ON UPDATE no action;
