ALTER TABLE "Game" RENAME TO "GameIdentifier";--> statement-breakpoint
ALTER TABLE "GameIdentifier" ADD COLUMN "gameId" integer;--> statement-breakpoint

CREATE TABLE "Game" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Game_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "name" varchar NOT NULL
);--> statement-breakpoint
INSERT INTO "Game" ("name") SELECT DISTINCT "name" FROM "GameIdentifier";--> statement-breakpoint

UPDATE "GameIdentifier"
SET "gameId" = "Game"."id"
FROM "Game"
WHERE "GameIdentifier"."name" = "Game"."name";--> statement-breakpoint

ALTER TABLE "GameIdentifier" ALTER COLUMN "gameId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "GameIdentifier" ADD CONSTRAINT "GameIdentifier_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameIdentifier" DROP COLUMN "name";--> statement-breakpoint

ALTER TABLE "Event" ADD COLUMN "gameId2" integer;--> statement-breakpoint
ALTER TABLE "GameActivity" ADD COLUMN "gameId2" integer;--> statement-breakpoint

UPDATE "Event"
SET "gameId2" = "GameIdentifier"."gameId"
FROM "GameIdentifier"
WHERE "GameIdentifier"."id" = "Event"."gameId";--> statement-breakpoint

UPDATE "GameActivity"
SET "gameId2" = "GameIdentifier"."gameId"
FROM "GameIdentifier"
WHERE "GameIdentifier"."id" = "GameActivity"."gameId";--> statement-breakpoint

ALTER TABLE "Event" DROP COLUMN "gameId";--> statement-breakpoint
ALTER TABLE "Event" RENAME COLUMN "gameId2" TO "gameId";
ALTER TABLE "GameActivity" DROP COLUMN "gameId";--> statement-breakpoint
ALTER TABLE "GameActivity" RENAME COLUMN "gameId2" TO "gameId";--> statement-breakpoint

ALTER TABLE "Event" ADD CONSTRAINT "Event_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GameActivity" ADD CONSTRAINT "GameActivity_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
