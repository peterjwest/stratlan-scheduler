ALTER TABLE "Event" ADD COLUMN "gameId" varchar;--> statement-breakpoint
ALTER TABLE "Event" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Event" ADD CONSTRAINT "Event_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE no action ON UPDATE no action;
