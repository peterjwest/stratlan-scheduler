import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, isNotNull, sql, asc, desc, and, gt, lt } from 'drizzle-orm' ;
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import schema, { User, Team, Score, Event, Lan } from './schema';
import { TeamName, ScoreType } from './constants';
import { getDayStart, getDayEnd } from './util';

export type DatabaseClient = NodePgDatabase<typeof schema>;

type UserData = {
    accessToken: string,
    discordUsername: string,
    discordNickname: string | null,
    discordAvatarId: string | null,
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

export async function createTeams(db: DatabaseClient, teamNames: readonly TeamName[]): Promise<Team[]> {
    const existingTeams = await db.query.Team.findMany();

    if (existingTeams.length === 0) {
        return db.insert(Team).values(teamNames.map((name) => ({ name }))).returning();
    }

    const existingTeamNames = new Set(existingTeams.map((team) => team.name));
    if (existingTeamNames.difference(new Set(teamNames)).size > 0) {
        throw new Error('Incompatible teams have already been created on this database');
    }
    return existingTeams;
}

export async function createScore(
    db: DatabaseClient,
    assigner: User,
    points: number,
    reason: string | undefined,
    team: Team,
    user?: User,
): Promise<Score> {
    return (await db.insert(Score).values({
        type: 'Awarded',
        teamId: team.id,
        userId: user?.id,
        assignerId: assigner.id,
        points: points,
        reason: reason,
    }).returning())[0];
}

export async function getScores(db: DatabaseClient, type?: ScoreType, assigned?: boolean): Promise<Score[]> {
    const conditions = [];
    if (assigned) conditions.push(isNotNull(Score.assignerId));
    if (type) conditions.push( eq(Score.type, type));
    return db.query.Score.findMany({
        where: and(...conditions),
        with: { user: true, assigner: true },
        orderBy: [desc(Score.createdAt)],
    });
}

export async function getTeamPoints(db: DatabaseClient, team: Team): Promise<number> {
    const results = await db.select({ total: sql`sum(${Score.points})`.mapWith(Number) }).from(Score).where(eq(Score.teamId, team.id));
    return results[0].total;
}

export async function getLanEvents(db: DatabaseClient, lan?: Lan): Promise<Event[]> {
    if (!lan)  return [];
    return db.query.Event.findMany({
        where: and(
            eq(Event.isOfficial, true),
            gt(Event.startTime, getDayStart(lan.startDate)),
            lt(Event.startTime, getDayEnd(lan.endDate)),
        ),
        orderBy: [asc(Event.startTime)],
    });
};

export async function getCurrentLan(db: DatabaseClient): Promise<Lan | undefined> {
    return db.query.Lan.findFirst({
        where: gt(Lan.endDate, new Date()),
        orderBy: [asc(Lan.endDate)],
    });
}
