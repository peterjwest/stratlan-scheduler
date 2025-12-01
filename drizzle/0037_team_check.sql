ALTER TABLE "Score" DROP CONSTRAINT "teamId_or_userId";--> statement-breakpoint
ALTER TABLE "Score" ADD CONSTRAINT "Team_teamId_or_userId" CHECK (("Score"."teamId" IS NOT NULL AND "Score"."userId" IS NULL) OR ("Score"."teamId" IS NULL AND "Score"."userId" IS NOT NULL));
