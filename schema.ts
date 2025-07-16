import { integer, pgTable, boolean, varchar, json, timestamp, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    discordId: varchar().notNull().unique(),
    discordUsername: varchar().notNull(),
    accessToken: varchar(),
    steamId: varchar(),
    steamUsername: varchar(),
    steamAvatar: varchar(),
    isAdmin: boolean().notNull(),
});
export type User = typeof users.$inferSelect;

export const sessions = pgTable('sessions', {
    sid: varchar().primaryKey().notNull(),
    sess: json().notNull(),
    expire: timestamp().notNull(),
}, (table) => [
    index('expire_idx').on(table.expire),
]);
export type Session = typeof sessions.$inferSelect;

export default {
    users,
    sessions,
};
