ALTER TABLE "HiddenCode" ADD COLUMN "number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "HiddenCode" ADD CONSTRAINT "HiddenCode_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "HiddenCode" ADD CONSTRAINT "HiddenCode_number_and_lan_unique" UNIQUE("number","lanId");--> statement-breakpoint
ALTER TABLE "HiddenCode" ADD CONSTRAINT "HiddenCode_code_and_lan_unique" UNIQUE("code","lanId");
