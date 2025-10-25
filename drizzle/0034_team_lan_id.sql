ALTER TABLE "Team" ADD COLUMN "lanId" integer;--> statement-breakpoint
ALTER TABLE "Team" ADD CONSTRAINT "Team_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;

UPDATE "Team" SET "lanId" = 1;--> statement-breakpoint

ALTER TABLE "Team" ALTER COLUMN "lanId" SET NOT NULL;--> statement-breakpoint
