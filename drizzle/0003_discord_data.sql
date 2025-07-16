ALTER TABLE "users" ADD COLUMN "discordUsername" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accessToken" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isAdmin" boolean NOT NULL;