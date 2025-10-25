ALTER TABLE "Event" ADD COLUMN "lanId" integer;--> statement-breakpoint
ALTER TABLE "GameActivity" ADD COLUMN "lanId" integer;--> statement-breakpoint
ALTER TABLE "IntroChallenge" ADD COLUMN "lanId" integer;--> statement-breakpoint
ALTER TABLE "Score" ADD COLUMN "lanId" integer;--> statement-breakpoint
ALTER TABLE "Event" ADD CONSTRAINT "Event_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameActivity" ADD CONSTRAINT "GameActivity_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "IntroChallenge" ADD CONSTRAINT "IntroChallenge_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Score" ADD CONSTRAINT "Score_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;

UPDATE "Event" SET "lanId" = 1;--> statement-breakpoint
UPDATE "GameActivity" SET "lanId" = 1;--> statement-breakpoint
UPDATE "IntroChallenge" SET "lanId" = 1;--> statement-breakpoint
UPDATE "Score" SET "lanId" = 1;--> statement-breakpoint

ALTER TABLE "Event" ALTER COLUMN "lanId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "GameActivity" ALTER COLUMN "lanId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "IntroChallenge" ALTER COLUMN "lanId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "lanId" SET NOT NULL;
