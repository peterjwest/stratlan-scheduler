import { integer, pgTable, boolean, varchar, json, timestamp, index } from 'drizzle-orm/pg-core';

export const User = pgTable('users', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    discordId: varchar().notNull().unique(),
    discordUsername: varchar().notNull(),
    accessToken: varchar(),
    steamId: varchar(),
    steamUsername: varchar(),
    steamAvatar: varchar(),
    isAdmin: boolean().notNull(),
});
export type User = typeof User.$inferSelect;

export const Session = pgTable('sessions', {
    sid: varchar().primaryKey().notNull(),
    sess: json().notNull(),
    expire: timestamp().notNull(),
}, (table) => [
    index('expire_idx').on(table.expire),
]);
export type Session = typeof Session.$inferSelect;

export const Team = pgTable('teams', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
});
export type Team = typeof Team.$inferSelect;

export const Score = pgTable('scores', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    teamId: integer('teamId').references(() => Team.id),
    type: varchar().notNull(), //Awarded, CommunityGame, OneTimeCode, Achievement
    player: integer().references(() => User.id),
    assignerId: integer('assignerId').references(() => User.id),
    createdAt: timestamp().defaultNow(),
});
export type Score = typeof Score.$inferSelect;

export default {
    User,
    Session,
    Team,
    Score,
};
