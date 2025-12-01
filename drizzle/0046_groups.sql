CREATE TABLE "Group" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Group_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "name" varchar NOT NULL,
    CONSTRAINT "Group_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "UserGroup" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "UserGroup_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    "userId" integer NOT NULL,
    "groupId" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_Group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE no action ON UPDATE no action;
