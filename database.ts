import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import { eq, isNotNull, sql, asc, desc, or, and, gt, lt, gte, not, inArray, isNull, max, count, sum } from 'drizzle-orm';
import lodash from 'lodash';

import schema, {
    User,
    UserTeams,
    UserGroups,
    UserPoints,
    UserRole,
    UserGroup,
    Group,
    UserLan,
    Team,
    TeamScore,
    Score,
    ScoreBonus,
    ScoreReferences,
    Event,
    EventTimeslot,
    EventWithTimeslots,
    Lan,
    LanTeams,
    Game,
    GameWithDuplicates,
    GameIdentifier,
    GameActivity,
    GameActivityWithTeam,
    IntroChallenge,
    HiddenCode,
    HiddenCodeUrl,
    LanProgress,
} from './schema.js';
import { LanData, EventData, HiddenCodeData } from './validation.js';
import {
    TeamName,
    ScoreType,
    IntroChallengeType,
    INTRO_CHALLENGE_TYPES,
    INTRO_CHALLENGE_POINTS,
    MODERATOR_ROLES,
    HIDDEN_CODE_POINTS,
    HIDDEN_CODE_BONUS_POINTS,
    SECRET_POINTS,
    PAGE_SIZE,
} from './constants.js';
import {
    getTimeslotEnd,
    addDays,
    cacheCall,
    getTeam,
    fromNulls,
    toNulls,
    formatName,
    absoluteUrl,
    randomCode,
    addGroups,
    NullToUndefined,
} from './util.js';
import { ApplicationActivity } from './discordApi.js';
import { DATABASE_URL, REMOTE_DATABASE_URL } from './environment.js';

export type DatabaseClient = NodePgDatabase<typeof schema> & { disconnect: () => Promise<void> };
export type Transaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

type UserData = {
    discordId: string,
    discordUsername: string,
    discordNickname?: string,
    discordAvatarId?: string,
    accessToken?: string,
    seatPickerName?: string,
};

export async function get<Type>(query: Promise<Type[] | Type>): Promise<NullToUndefined<Type>> {
    const data = await query;
    if (!Array.isArray(data)) return fromNulls(data);
    if (data.length !== 1) throw new Error(`Query expected to return one result, returned ${data.length}`);
    return fromNulls(data[0]!);
}

export async function list<Type>(query: Promise<Type[]>): Promise<NullToUndefined<Type[]>> {
    const data = await query;
    return fromNulls(data);
}

export async function getCount(query: Promise<Array<{ count: number }>>): Promise<number> {
    const data = await query;
    return data[0]?.count || 0;;
}

export function getDatabaseClient(isRemote = false): DatabaseClient {
    let postgresUrl = DATABASE_URL;
    if (isRemote) {
        if (!REMOTE_DATABASE_URL) throw new Error('Env variable REMOTE_DATABASE_URL required');
        postgresUrl = REMOTE_DATABASE_URL;
    }

    const client = new Pool({
        connectionString: postgresUrl,
        ssl: isRemote ? { rejectUnauthorized: false }: undefined,
    });
    const db = drizzle(client, { schema });
    return Object.assign(db, { disconnect: () => client.end() });
}

export async function getLanUsers(
    db: DatabaseClient, lan: Lan & LanTeams,
): Promise<Array<User & UserTeams>> {
    const data = await list(
        db.select({
            user: User,
            userLan: UserLan,
        })
        .from(User)
        .innerJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
    );

    const users = data.map((item) => ({
        ...item.user,
        team: getTeam(lan, item.userLan.teamId),
        isEnrolled: true,
    }));

    return lodash.orderBy(users, (user) => formatName(user).toLowerCase());
}

export async function getLanUsersWithGroups(
    db: DatabaseClient | Transaction, lan: Lan & LanTeams, groups: Group[],
): Promise<Array<User & UserTeams & UserGroups>> {
    const data = await list(
        db.select({
            user: User,
            userLan: UserLan,
            groupIds: sql<string[]>`array_agg("UserGroup"."groupId")`,
        })
        .from(User)
        .innerJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .leftJoin(UserGroup, eq(UserGroup.userId, User.id))
        .groupBy(User.id, UserLan.userId, UserLan.lanId)
    );

    const users = data.map((item) => ({
        ...item.user,
        team: getTeam(lan, item.userLan.teamId),
        isEnrolled: true,
        groupIds: item.groupIds,
    }));

    return lodash.orderBy(addGroups(users, groups), (user) => formatName(user).toLowerCase());
}

export async function getUserWithTeam(
    db: DatabaseClient, lan: Lan & LanTeams, id: number,
): Promise<User & UserTeams | undefined> {
    const data = await get(
        db.select({ user: User, userLan: UserLan })
        .from(User)
        .where(eq(User.id, id))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
    );

    if (!data) return;
    return {
        ...data.user,
        team: getTeam(lan, data.userLan?.teamId),
        isEnrolled: Boolean(data.userLan),
    };
}

export async function getUser(
    db: DatabaseClient, lan: Lan & LanTeams | undefined, userId: number,
): Promise<User & UserTeams | undefined> {
    if (lan) return getUserWithTeam(db, lan, userId);

    const data = await get(
        db.select({ user: User })
        .from(User)
        .where(eq(User.id, userId))
    );

    return data ? { ...data.user, team: undefined, isEnrolled: false } : undefined;
}

export async function getPointsByUser(db: DatabaseClient, lan: Lan, users: User[]) {
    const data = (
        await db.select({ id: User.id, total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .leftJoin(User, eq(User.id, Score.userId))
        .where(and(
            eq(Score.lanId, lan.id),
            inArray(User.id, users.map((user) => user.id)),
        ))
        .groupBy(User.id)
    );

    return lodash.mapValues(lodash.keyBy(data, 'id'), 'total');
}

export async function getLanUsersWithPoints(
    db: DatabaseClient, lan: Lan & LanTeams, groups: Group[],
): Promise<Array<User & UserTeams & UserGroups & UserPoints>> {
    const users = await getLanUsersWithGroups(db, lan, groups);
    const pointsByUser = await getPointsByUser(db, lan, users);
    return lodash.orderBy(users.map((user) => ({
        ...user,
        points: pointsByUser[user.id] || 0,
    })), 'points', 'desc');
}

export async function checkIsAdmin(db: DatabaseClient, userId: number | undefined): Promise<boolean> {
    if (!userId) return false;
    return (
        await db.select({ id: UserRole.id })
        .from(UserRole)
        .where(and(eq(UserRole.userId, userId), inArray(UserRole.role, MODERATOR_ROLES)))
    ).length > 0;
}

export async function checkIsEligible(db: DatabaseClient, user: User, lan: Lan): Promise<boolean> {
    return (
        await db.select({ id: UserRole.id })
        .from(UserRole)
        .where(and(
            eq(UserRole.userId, user.id),
            or(eq(UserRole.role, lan.role || ''), inArray(UserRole.role, MODERATOR_ROLES))
        ))
    ).length > 0;
}

export async function getEvent(db: DatabaseClient, lan: Lan, eventId: number): Promise<Event | undefined> {
    return get(db.query.Event.findFirst({
        where: and(eq(Event.id, eventId), eq(Event.lanId, lan.id)),
    }));
}

export async function updateEvent(db: DatabaseClient, event: Event, data: EventData & { eventCode: string }) {
    await db.update(Event).set(toNulls(data)).where(eq(Event.id, event.id));
}

export async function createEvent(
    db: DatabaseClient, lan: Lan, data: EventData & { createdBy: number, eventCode: string },
) {
    await db.insert(Event).values({ ...toNulls(data), lanId: lan.id, isOfficial: true });
}

export async function getUserByDiscordId(db: DatabaseClient, discordId: string): Promise<User | undefined> {
    return get(db.query.User.findFirst({ where: eq(User.discordId, discordId) }));
}

export async function getUsersByDiscordIds(db: DatabaseClient, discordIds: string[]): Promise<User[]> {
    return list(db.query.User.findMany({ where: inArray(User.discordId, discordIds) }));
}

interface MinimalEvent {
    id: number;
    name: string;
}

export async function getMinimalEvents(db: DatabaseClient, lan: Lan): Promise<MinimalEvent[]> {
    return db.query.Event.findMany({ columns: { id: true, name: true }, where: eq(Event.lanId, lan.id) });
}

interface MinimalUser {
    id: number;
    discordUsername: string;
    discordNickname: string | undefined;
}

export async function getMinimalUsers(db: DatabaseClient, lan: Lan): Promise<MinimalUser[]> {
    return list(
        db.select({ id: User.id, discordUsername: User.discordUsername, discordNickname: User.discordNickname })
        .from(User)
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(eq(UserLan.lanId, lan.id))
    );
}

export async function createOrUpdateUser(db: DatabaseClient, data: UserData): Promise<User> {
    const existingUser = await getUserByDiscordId(db, data.discordId);
    if (existingUser) {
        return await get(
            db.update(User)
            .set(toNulls(data))
            .where(eq(User.id, existingUser.id))
            .returning()
        );
    }
    return await get(db.insert(User).values(toNulls(data)).returning());
}

export async function createOrUpdateSeatPickerUsers(db: DatabaseClient, data: UserData[]): Promise<User[]> {
    return list(db.insert(User).values(toNulls(data)).onConflictDoUpdate({
        target: User.discordId,
        set: { seatPickerName: sql`excluded."seatPickerName"` },
    }).returning());
}

export async function updateUser(db: DatabaseClient, userId: number, data: Partial<User>) {
    await db.update(User).set(toNulls(data)).where(eq(User.id, userId));
}

export async function updateUserTeam(db: DatabaseClient | Transaction, lan: Lan, user: User, team: Team) {
    await db.update(UserLan).set({ teamId: team.id }).where(and(
        eq(UserLan.lanId, lan.id), eq(UserLan.userId, user.id),
    ));
}

export async function updateRoles(db: DatabaseClient, user: User, roles: string[]) {
    await db.transaction(async (tx) => {
        await tx.delete(UserRole).where(eq(UserRole.userId, user.id));
        if (roles.length > 0) {
            await tx.insert(UserRole).values(roles.map((role) => ({ userId: user.id, role })));
        }
    });
}

export async function createGroups(db: DatabaseClient, groups: string[]) {
    return list(db.insert(Group).values(groups.map((name) => ({ name }))).onConflictDoUpdate({
        target: Group.name,
        set: { name: sql`excluded."name"` },
    }).returning());
}

export async function createTeams(
    db: DatabaseClient, lan: Lan, teamNames: readonly TeamName[],
): Promise<Team[]> {
    const existingTeams = await db.query.Team.findMany();

    if (existingTeams.length === 0) {
        return db.insert(Team).values(teamNames.map((name) => ({ name, lanId: lan.id }))).returning();
    }

    const existingTeamNames = new Set(existingTeams.map((team) => team.name));
    if (existingTeamNames.difference(new Set(teamNames)).size > 0) {
        throw new Error('Incompatible teams have already been created on this database');
    }
    return existingTeams;
}

export async function awardScore(
    db: DatabaseClient,
    lan: Lan,
    assigner: User,
    points: number,
    reason: string | undefined,
    event: Event | undefined,
    teamOrUser: Team | User,
): Promise<Score> {
    let team: Team | undefined;
    let user: User | undefined;
    if ('name' in teamOrUser) {
        team = teamOrUser;
    } else {
        user = teamOrUser;
    }
    return get(db.insert(Score).values({
        type: 'Awarded',
        lanId: lan.id,
        teamId: team?.id,
        userId: user?.id,
        assignerId: assigner.id,
        points: points,
        reason: reason,
        eventId: event?.id,
    }).returning());
}

export async function countScores(db: DatabaseClient, lan: Lan, type: ScoreType | undefined) {
    const conditions = [eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));
    return await getCount(db.select({ count: count() }).from(Score).where(and(...conditions)));
}

export async function countUserScores(db: DatabaseClient, lan: Lan, user: User, type: ScoreType | undefined) {
    const conditions = [eq(Score.userId, user.id), eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));
    return await getCount(db.select({ count: count() }).from(Score).where(and(...conditions)));
}

export async function getScoresPaged(
    db: DatabaseClient, lan: Lan & LanTeams, type: ScoreType | undefined, page: number = 1,
): Promise<Array<Score & ScoreReferences>> {
    const conditions = [eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));

    const Assigner = alias(User, 'Assigner');
    const data = await list(
        db.select({ score: Score, event: Event, assigner: Assigner, user: User, userLan: UserLan })
        .from(Score)
        .leftJoin(Event, eq(Score.eventId, Event.id))
        .leftJoin(Assigner, eq(Score.assignerId, Assigner.id))
        .leftJoin(User, eq(Score.userId, User.id))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .orderBy(desc(Score.createdAt))
        .where(and(...conditions))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)
    );

    return data.map((item) => {
        return {
            ...item.score,
            team: getTeam(lan, item.userLan?.teamId || item.score.teamId),
            event: item.event,
            assigner: item.assigner,
            user: item.user,
        };
    });
}

export async function getScores(
    db: DatabaseClient, lan: Lan & LanTeams, after: Date,
): Promise<Array<Score & { user: User | undefined }>> {
    const data = await list(
        db.select({ score: Score, user: User })
        .from(Score)
        .leftJoin(Event, eq(Score.eventId, Event.id))
        .leftJoin(User, eq(Score.userId, User.id))
        .orderBy(asc(Score.createdAt))
        .where(and(eq(Score.lanId, lan.id), gt(Score.createdAt, after)))
    );

    return data.map((item) => {
        return {
            ...item.score,
            user: item.user && item.user,
        };
    });
}


export async function getUserScores(
    db: DatabaseClient, lan: Lan & LanTeams, user: User, type?: ScoreType, page: number = 1,
): Promise<Array<Score & ScoreReferences>> {
    if (!lan) return [];

    const conditions = [eq(Score.userId, user.id), eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));

    const Assigner = alias(User, 'Assigner');
    const data = await list(
        db.select({ score: Score, event: Event, assigner: Assigner, user: User, userLan: UserLan })
        .from(Score)
        .leftJoin(Event, eq(Score.eventId, Event.id))
        .leftJoin(Assigner, eq(Score.assignerId, Assigner.id))
        .leftJoin(User, eq(Score.userId, User.id))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .orderBy(desc(Score.createdAt))
        .where(and(...conditions))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)
    );

    return data.map((item) => {
        return {
            ...item.score,
            team: getTeam(lan, item.userLan?.teamId || item.score.teamId),
            event: item.event,
            assigner: item.assigner,
            user: item.user,
        };
    });
}

export async function getEventCodeScore(
    db: DatabaseClient, user: User, event: Event,
): Promise<Score | undefined> {
    return get(db.query.Score.findFirst({
        where: and(eq(Score.userId, user.id), eq(Score.eventId, event.id), eq(Score.attendedEvent, true)),
    }));
}

export async function createEventCodeScore(
    db: DatabaseClient, user: User, event: Event,
): Promise<Score> {
    return get(db.insert(Score).values({
        type: 'AttendedEvent',
        userId: user.id,
        lanId: event.lanId,
        eventId: event.id,
        attendedEvent: true,
        points: event.eventPoints,
    }).returning());
}

export async function getHiddenCodeScore(
    db: DatabaseClient, user: User, code: HiddenCode,
): Promise<Score | undefined> {
    return get(db.query.Score.findFirst({
        where: and(eq(Score.userId, user.id), eq(Score.hiddenCodeId, code.id)),
    }));
}

export async function createHiddenCodeScore(
    db: DatabaseClient, user: User, code: HiddenCode,
): Promise<Score & ScoreBonus | undefined> {
    return db.transaction(async (tx) => {
        const existingScores = await getCount(
            tx.select({ count: count() }).from(Score).where(eq(Score.hiddenCodeId, code.id)),
        );

        const hasBonus = existingScores === 0;
        const points = hasBonus ? HIDDEN_CODE_POINTS + HIDDEN_CODE_BONUS_POINTS : HIDDEN_CODE_POINTS;

        const result = await list(tx.insert(Score).values({
            type: 'HiddenCode',
            userId: user.id,
            lanId: code.lanId,
            hiddenCodeId: code.id,
            points,
        }).onConflictDoNothing().returning());

        return result[0] ? { ...result[0], hasBonus } : undefined;
    });
}

export async function getScoresDetails(db: DatabaseClient, lan: Lan & LanTeams, scores: Score[]) {
    const userIds = scores.map((score) => score.userId).filter((userId): userId is number => Boolean(userId));
    const userData = await list(db.select({ user: User, userLan: UserLan })
        .from(User)
        .where(and(inArray(User.id, userIds), isNotNull(UserLan.teamId)))
        .innerJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
    );
    const users = userData.map((data) => ({
        ...data.user,
        team: getTeam(lan, data.userLan.teamId!),
    }));

    const usersById = lodash.keyBy(users, 'id');

    return scores.map((score) => {
        const user = score.userId ? usersById[score.userId] : undefined;
        const teamId = user ? user.team.id : score.teamId;
        return teamId && {
            teamId,
            username: user && formatName(user),
            points: score.points,
        };
    });
}

export async function getTeamPoints(db: DatabaseClient, lan: Lan, team: Team, until?: Date): Promise<number> {
    const conditions = [
        eq(Score.lanId, lan.id),
        or(eq(Score.teamId, team.id), eq(UserLan.teamId, team.id)),
    ];
    if (until) conditions.push(lt(Score.createdAt, until));
    const results = await get(
        db.select({ total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .leftJoin(User, eq(User.id, Score.userId))
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(and(...conditions))
    );
    return results.total || 0;
}

export async function getTeamVisiblePoints(
    db: DatabaseClient, lan: Lan & LanProgress, team: Team, until?: Date,
): Promise<number> {
    return lan.isStarted ? await getTeamPoints(db, lan, team, until) : 0;
}

export async function teamsWithPoints(
    db: DatabaseClient, lan: Lan & LanTeams & LanProgress, until?: Date
): Promise<Array<Team & TeamScore>> {
    const teamPoints: Record<string, number> = {};
    for (const team of lan.teams) {
        teamPoints[team.id] = await getTeamVisiblePoints(db, lan, team, until);
    }

    return lan.teams.map((team) => {
        const points = teamPoints[team.id]!;
        return { ...team, points };
    });
}

export async function getUserPoints(db: DatabaseClient, lan: Lan, user: User): Promise<number> {
    const results = await get(
        db.select({ total: sum(Score.points).mapWith(Number) })
        .from(Score)
        .where(and(eq(Score.userId, user.id), eq(Score.lanId, lan.id)))
    );
    return results.total || 0;
}

export async function getEvents(db: DatabaseClient, lan: Lan): Promise<Event[]> {
    return list(db.query.Event.findMany({
        where: and(
            eq(Event.isOfficial, true),
            eq(Event.lanId, lan.id)
        ),
        orderBy: [asc(Event.startTime)],
    }));
};

export async function getCurrentLan(db: DatabaseClient): Promise<Lan & LanTeams | undefined> {
    return get(db.query.Lan.findFirst({
        where: gte(Lan.eventEnd, addDays(new Date(), -3)),
        orderBy: [asc(Lan.eventEnd)],
        with: { teams: true },
    }));
}

export const [getCurrentLanCached, clearCurrentLanCache] = cacheCall(getCurrentLan);

export async function getLans(db: DatabaseClient): Promise<Array<Lan & LanTeams>> {
    return list(db.query.Lan.findMany({ orderBy: [asc(Lan.scheduleEnd)], with: { teams: true } }));
}

export const [getLansCached, clearLansCache] = cacheCall(getLans);

export async function getLan(db: DatabaseClient, lanId: number): Promise<Lan & LanTeams | undefined> {
    return get(db.query.Lan.findFirst({ where: eq(Lan.id, lanId), with: { teams: true } }));
}

export async function createLan(db: DatabaseClient, data: LanData) {
    await db.insert(Lan).values(toNulls(data));

    clearCurrentLanCache();
    clearLansCache();
}

export async function updateLan(db: DatabaseClient, lan: Lan, data: Partial<LanData>) {
    await db.update(Lan).set(toNulls(data)).where(eq(Lan.id, lan.id));

    clearCurrentLanCache();
    clearLansCache();
}

export async function endGameActivities(db: DatabaseClient, user: User, games: Game[]): Promise<void> {
    await db.update(GameActivity).set({ endTime: sql`NOW()` }).where(and(
        eq(GameActivity.userId, user.id),
        not(inArray(GameActivity.gameId, games.map((game) => game.id))),
        isNull(GameActivity.endTime),
    ));
}

export async function createGames(db: DatabaseClient, names: string[]) {
    return db.insert(Game).values(names.map((name) => ({ name }))).onConflictDoNothing();
}

export async function getOrCreateGames(
    db: DatabaseClient, activities: ApplicationActivity[],
): Promise<Game[]> {
    if (activities.length === 0) return [];

    const gameNames = lodash.uniq(activities.map((item) => item.name));
    await createGames(db, gameNames);

    const games = await list(db.query.Game.findMany({ where: inArray(Game.name, gameNames) }));
    const gamesByName = lodash.keyBy(games, 'name');

    const identifiers = activities.map(({ applicationId, name }) => {
        return { id: applicationId, gameId: gamesByName[name]!.id };
    });

    const existingIdentifiers = await db.query.GameIdentifier.findMany({
        where: inArray(GameIdentifier.id, identifiers.map((identifier) => identifier.id)),
    });
    const existingIdentifierIds = new Set(existingIdentifiers.map((item) => item.id));

    const missingIdentifiers = identifiers.filter(
        ({ id }) => !existingIdentifierIds.has(id),
    );
    if (missingIdentifiers.length > 0) {
        await db.insert(GameIdentifier).values(missingIdentifiers).onConflictDoNothing();
    };

    return games;
}

export async function getGame(db: DatabaseClient, gameId: number): Promise<Game | undefined> {
    return get(db.query.Game.findFirst({ where: eq(Game.id, gameId) }));
}

export async function getGameWithDuplicates(db: DatabaseClient, gameId: number): Promise<GameWithDuplicates | undefined> {
    return get(db.query.Game.findFirst({
        where: eq(Game.id, gameId),
        with: { duplicates: true },
    }));
}

export async function getGamesWithDuplicates(db: DatabaseClient): Promise<GameWithDuplicates[]> {
    return list(db.query.Game.findMany({
        where: isNull(Game.parentId),
        with: { duplicates: true },
        orderBy: [Game.name],
    }));
}

export async function getGames(db: DatabaseClient): Promise<Game[]> {
    return list(db.query.Game.findMany({ where: isNull(Game.parentId), orderBy: [Game.name] }));
}

export async function updateGame(db: DatabaseClient, gameId: number, data: Partial<Game>): Promise<void> {
    await db.update(Game).set(toNulls(data)).where(eq(Game.id, gameId));
}

export async function getGameActivity(
    db: DatabaseClient, lan: Lan, user: User, game: Game,
): Promise<GameActivity | undefined> {
    return get(db.query.GameActivity.findFirst({
        where: and(
            eq(GameActivity.lanId, lan.id),
            eq(GameActivity.userId, user.id),
            eq(GameActivity.gameId, game.id),
        ),
    }));
}

export async function startGameActivities(
    db: DatabaseClient, lan: Lan, user: User, games: Game[], startTime: Date,
) {
    if (games.length === 0) return;

    await db.insert(GameActivity).values(games.map((game) => ({
        lanId: lan.id,
        userId: user.id,
        gameId: game.id,
        startTime: startTime,
    }))).onConflictDoNothing();
}

export async function getTimeslotActivities(
    db: DatabaseClient, lan: Lan, event: Event, eventTimeslot: EventTimeslot,
): Promise<GameActivityWithTeam[]> {
    if (!event.gameId) return [];
    return list(
        db.select({
            id: GameActivity.id,
            lanId: GameActivity.lanId,
            userId: GameActivity.userId,
            teamId: UserLan.teamId,
            gameId: GameActivity.gameId,
            startTime: GameActivity.startTime,
            endTime: GameActivity.endTime,
        })
        .from(GameActivity)
        .leftJoin(User, eq(User.id, GameActivity.userId))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .leftJoin(Game, eq(Game.id, GameActivity.gameId))
        .where(and(
            or(eq(GameActivity.gameId, event.gameId), eq(Game.parentId, event.gameId)),
            lt(GameActivity.startTime, getTimeslotEnd(eventTimeslot)),
            or(isNull(GameActivity.endTime), gt(GameActivity.endTime, eventTimeslot.time)),
        ))
    );
}

export async function getTimeslot(db: DatabaseClient, timeslotId: number): Promise<EventTimeslot | undefined> {
    return db.query.EventTimeslot.findFirst({ where: eq(EventTimeslot.id, timeslotId) });
}

export async function getIncompleteCommunityEvents(db: DatabaseClient, lan: Lan): Promise<EventWithTimeslots[]> {
    return list(db.query.Event.findMany({
        where: and(
            eq(Event.lanId, lan.id),
            isNotNull(Event.gameId),
            gt(Event.gamePoints, sql`0`),
            gt(sql`NOW()`, Event.startTime),
            eq(Event.isProcessed, false),
        ),
        with: { timeslots: { orderBy: [asc(EventTimeslot.time)] } },
    }));
}

export async function getOrCreateIntroChallenge(
    db: DatabaseClient, type: IntroChallengeType, lan: Lan, user: User,
): Promise<IntroChallenge> {
    const challenge = await get(db.query.IntroChallenge.findFirst({
        where: and(eq(IntroChallenge.type, type), eq(IntroChallenge.userId, user.id)),
    }));
    if (challenge) return challenge;
    return get(db.insert(IntroChallenge).values({
        lanId: lan.id, userId: user.id, type: type,
    }).returning());
}

type IntroChallengeMap = {
    [Key in IntroChallengeType]?: IntroChallenge
};

export async function getIntroChallenges(
    db: DatabaseClient, lan: Lan, user: User | undefined,
): Promise<IntroChallengeMap> {
    const challenges: IntroChallengeMap = Object.fromEntries(INTRO_CHALLENGE_TYPES.map((type) => [type, undefined]));
    if (user && lan) {
        const introChallenges = await list(db.query.IntroChallenge.findMany({
            where: and(eq(IntroChallenge.userId, user.id), eq(IntroChallenge.lanId, lan.id)),
        }));
        for (const introChallenge of introChallenges) {
            challenges[introChallenge.type] = introChallenge;
        }
    }
    return challenges;
}

export async function claimChallenge(db: DatabaseClient, lan: Lan, user: User, challengeId: number): Promise<Score | undefined> {
    return db.transaction(async (tx) => {
        const introChallenge = await get(tx.query.IntroChallenge.findFirst({
            where: and(
                eq(IntroChallenge.lanId, lan.id),
                eq(IntroChallenge.userId, user.id),
                eq(IntroChallenge.id, challengeId),
            ),
        }));
        if (!introChallenge) {
            throw new Error(`IntroChallenge#${challengeId} does not exist for User#${user.id}, Lan#${lan.id}`);
        }
        if (introChallenge.scoreId) {
            return undefined;
        }

        const score = await get(tx.insert(Score).values({
            type: 'IntroChallenge',
            lanId: lan.id,
            userId: user.id,
            points: INTRO_CHALLENGE_POINTS[introChallenge.type],
        }).returning());

        const updated = await tx.update(IntroChallenge)
            .set({ scoreId: score.id })
            .where(and(
                eq(IntroChallenge.id, challengeId),
                isNull(IntroChallenge.scoreId),
            ))
            .returning();

        if (updated.length === 0) {
            return undefined;
        }

        return score;
    });
}

export async function getOrCreateUserLan(db: DatabaseClient, user: User, lan: Lan): Promise<UserLan> {
    const userLan = await get(db.query.UserLan.findFirst({
        where: and(eq(UserLan.userId, user.id), eq(UserLan.lanId, lan.id)),
    }));
    if (userLan) return userLan;

    return await get(db.insert(UserLan).values({ userId: user.id, lanId: lan.id }).returning());
}

export async function deleteUserGroups(db: DatabaseClient, users: User[]) {
    await db.delete(UserGroup).where(inArray(UserGroup.userId, users.map((user) => user.id)));
}

export async function createUserGroups(db: DatabaseClient, userGroups: Array<{ user: User, groups: Group[] }>) {
    const data = lodash.flatten(userGroups.map(({ user, groups }) => {
        return groups.map((group) => ({ userId: user.id, groupId: group.id }));
    }));
    await db.insert(UserGroup).values(data);
}

export async function replaceUserGroups(db: DatabaseClient, userGroups: Array<{ user: User, groups: Group[] }>) {
    await deleteUserGroups(db, userGroups.map(({ user }) => user));
    await createUserGroups(db, userGroups);
}

export async function getGroups(db: DatabaseClient): Promise<Group[]> {
    return db.query.Group.findMany();
}

export async function updateTeam(db: DatabaseClient, lan: Lan, user: User, team: Team): Promise<void> {
    await (
        db.update(UserLan).set({ teamId: team.id })
        .where(and(eq(UserLan.userId, user.id), eq(UserLan.lanId, lan.id)))
    );
}

export async function updateTeams(db: DatabaseClient, lan: Lan, users: Array<User & UserTeams>): Promise<void> {
    const userIds = users.map((user) => user.id);
    const cases = users.map((user) => sql<number>`when ${UserLan.userId} = ${user.id} then ${user.team!.id}`);
    const setTeamId = sql.join([sql`cast((case`, ...cases, sql`end) as integer)`], sql.raw(' '));
    await (
        db.update(UserLan).set({ teamId: setTeamId })
        .where(and(inArray(UserLan.userId, userIds), eq(UserLan.lanId, lan.id)))
    );
}

export async function getHiddenCodes(db: DatabaseClient, lan: Lan): Promise<Array<HiddenCode & HiddenCodeUrl>> {
    const data = await list(db.query.HiddenCode.findMany({
        where: eq(HiddenCode.lanId, lan.id),
        orderBy: [HiddenCode.number],
    }));
    return data.map((item) => ({ ...item, url: absoluteUrl(`/code/${item.code}`) }));
}

export async function getHiddenCode(
    db: DatabaseClient, lan: Lan, hiddenCodeId: number,
): Promise<HiddenCode & HiddenCodeUrl | undefined> {
    const data = await get(db.query.HiddenCode.findFirst({
        where: and(eq(HiddenCode.id, hiddenCodeId), eq(HiddenCode.lanId, lan.id)),
    }));
    return data ? { ...data, url: absoluteUrl(`/code/${data.code}`) } : undefined;
}

export async function getHiddenCodeByCode(
    db: DatabaseClient, lan: Lan, hiddenCode: string,
): Promise<HiddenCode & HiddenCodeUrl | undefined> {
    const data = await get(db.query.HiddenCode.findFirst({
        where: and(eq(HiddenCode.code, hiddenCode), eq(HiddenCode.lanId, lan.id)),
    }));
    return data ? { ...data, url: absoluteUrl(`/code/${data.code}`) } : undefined;
}

export async function createHiddenCode(db: DatabaseClient, lan: Lan, data: HiddenCodeData) {
    await db.transaction(async (tx) => {
        const maxNumber = (await get(
            tx.select({ value: max(HiddenCode.number) })
            .from(HiddenCode)
            .where(eq(HiddenCode.lanId, lan.id))
        )).value || 0;

        await tx.insert(HiddenCode).values({
            ...toNulls(data), lanId: lan.id, number: maxNumber + 1, code: randomCode(),
        });
    });
}

export async function updateHiddenCode(db: DatabaseClient, lan: Lan, code: HiddenCode, data: HiddenCodeData) {
    await db.update(HiddenCode).set(toNulls(data)).where(and(
        eq(HiddenCode.lanId, lan.id),
        eq(HiddenCode.id, code.id),
    ));
}

export async function getEventByCode(
    db: DatabaseClient, lan: Lan, code: string,
): Promise<Event | undefined> {
    return get(db.query.Event.findFirst({
        where: and(eq(Event.eventCode, code), eq(Event.lanId, lan.id)),
    }));
}

export async function createSecretScore(db: DatabaseClient, lan: Lan, user: User, secretNumber: number): Promise<Score | undefined> {
    const result = await list(db.insert(Score).values({
        type: 'Secret',
        lanId: lan.id,
        userId: user.id,
        points: SECRET_POINTS,
        secretNumber,
    }).onConflictDoNothing().returning());

    return result[0];
}
