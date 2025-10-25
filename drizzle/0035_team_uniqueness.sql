ALTER TABLE "Team" DROP CONSTRAINT "Team_name_unique";--> statement-breakpoint
ALTER TABLE "Team" ADD CONSTRAINT "Team_name_and_lan_unique" UNIQUE("name","lanId");
