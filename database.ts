import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm' ;
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import schema, { User, Team } from './schema';

type DatabaseClient = NodePgDatabase<typeof schema>;

type UserData = {
    accessToken: string,
    discordUsername: string,
    isAdmin: boolean,
};

export function getDatabaseClient(postgresUrl: string): DatabaseClient {
    return drizzle(postgresUrl, { schema });
}

export async function getUser(db: DatabaseClient, id: number): Promise<User | undefined> {
    return db.query.User.findFirst({ where: eq(User.id, id) });
}

export async function getUserByDiscordId(db: DatabaseClient, discordId: string): Promise<User | undefined> {
    return db.query.User.findFirst({ where: eq(User.discordId, discordId) });
}

export async function getMinimalUsers(db: DatabaseClient): Promise<{ id: number, discordUsername: string }[]> {
    return db.query.User.findMany({ columns: { id: true, discordUsername: true }});
}

export async function getOrCreateUserByDiscordId(db: DatabaseClient, discordId: string, data: UserData): Promise<User> {
    const existingUser = await getUserByDiscordId(db, discordId);
    if (existingUser) {
        return (await db.update(User).set(data).where(eq(User.id, existingUser.id)).returning())[0];
    }
    return (await db.insert(User).values({ discordId, ...data }).returning())[0];
}

export async function updateUser(db: DatabaseClient, userId: number, data: Partial<User>) {
    await db.update(User).set(data).where(eq(User.id, userId));
}

export async function createTeams(db: DatabaseClient, teamNames: string[]) {
    const existingTeams = new Set((await db.query.Team.findMany()).map((team) => team.name));

    if (existingTeams.size > 0 && existingTeams.difference(new Set(teamNames)).size > 0) {
        throw new Error('Incompatible teams have already been created on this database')
    }

    if (existingTeams.size === 0) {
        await db.insert(Team).values(teamNames.map((name) => ({ name })));
        return;
    }
}
