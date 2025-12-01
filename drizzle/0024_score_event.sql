ALTER TABLE "Score" ADD COLUMN "eventId" integer;--> statement-breakpoint
ALTER TABLE "Score" ADD CONSTRAINT "Score_eventId_Event_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE no action ON UPDATE no action;
