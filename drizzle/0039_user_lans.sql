CREATE TABLE "UserLan" (
    "userId" integer NOT NULL,
    "lanId" integer NOT NULL,
    "teamId" integer NOT NULL,
    CONSTRAINT "UserLan_userId_lanId_teamId_pk" PRIMARY KEY("userId","lanId","teamId")
);
--> statement-breakpoint
ALTER TABLE "UserLan" ADD CONSTRAINT "UserLan_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserLan" ADD CONSTRAINT "UserLan_lanId_Lan_id_fk" FOREIGN KEY ("lanId") REFERENCES "public"."Lan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserLan" ADD CONSTRAINT "UserLan_teamId_Team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE no action ON UPDATE no action;
