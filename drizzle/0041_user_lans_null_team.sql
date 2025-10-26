ALTER TABLE "UserLan" DROP CONSTRAINT "UserLan_userId_and_lanId_unique";--> statement-breakpoint
ALTER TABLE "UserLan" DROP CONSTRAINT "UserLan_userId_lanId_teamId_pk";--> statement-breakpoint
ALTER TABLE "UserLan" ALTER COLUMN "teamId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "UserLan" ADD CONSTRAINT "UserLan_userId_lanId_pk" PRIMARY KEY("userId","lanId");--> statement-breakpoint
ALTER TABLE "UserLan" ADD CONSTRAINT "UserLan_teamId_and_lanId_unique" UNIQUE("teamId","lanId");