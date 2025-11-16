import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import { eq, isNotNull, sql, asc, desc, or, and, gt, lt, gte, not, inArray, isNull, max, count } from 'drizzle-orm';
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
    Score,
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
} from './schema';
import { LanData, EventData, HiddenCodeData } from './validation';
import {
    TeamName,
    ScoreType,
    EVENT_TIMESLOT_MINUTES,
    IntroChallengeType,
    INTRO_CHALLENGE_TYPES,
    INTRO_CHALLENGE_POINTS,
    MODERATOR_ROLES,
    HIDDEN_CODE_POINTS,
    SECRET_POINTS,
    PAGE_SIZE,
} from './constants';
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
} from './util';
import { ApplicationActivity } from './discordApi';
import { DATABASE_URL, REMOTE_DATABASE_URL } from './environment';

export type DatabaseClient = NodePgDatabase<typeof schema> & { disconnect: () => Promise<void> };

type UserData = {
    discordId: string,
    discordUsername: string,
    discordNickname?: string,
    discordAvatarId?: string,
    accessToken?: string,
    seatPickerName?: string,
};

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
    db: DatabaseClient, lan: Lan & LanTeams, groups: Group[],
): Promise<Array<User & UserTeams & UserGroups>> {
    const data = fromNulls(
        await db.select({
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
        team: getTeam(lan, item.userLan!.teamId),
        isEnrolled: true,
        groupIds: item.groupIds,
    }));

    return lodash.orderBy(addGroups(users, groups), (user) => formatName(user).toLowerCase());
}

export async function getUserWithTeam(
    db: DatabaseClient, lan: Lan & LanTeams, id: number,
): Promise<User & UserTeams | undefined> {
    const data = fromNulls((
        await db.select({ user: User, userLan: UserLan })
        .from(User)
        .where(eq(User.id, id))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
    )[0]);

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

    const data = fromNulls((
        await db.select({ user: User })
        .from(User)
        .where(eq(User.id, userId))
    )[0]);

    if (!data) return;

    return { ...data.user, team: undefined, isEnrolled: false };
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
): Promise<Array<User & UserTeams & UserPoints>> {
    const users = await getLanUsers(db, lan, groups);
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
    return fromNulls(await db.query.Event.findFirst({
        where: and(eq(Event.id, eventId), eq(Event.lanId, lan.id)),
    }));
}

export async function updateEvent(db: DatabaseClient, event: Event, data: EventData) {
    await db.update(Event).set(toNulls(data)).where(eq(Event.id, event.id));
}

export async function createEvent(db: DatabaseClient, lan: Lan, data: EventData) {
    await db.insert(Event).values({ ...toNulls(data), lanId: lan.id, isOfficial: true });
}

export async function getUserByDiscordId(db: DatabaseClient, discordId: string): Promise<User | undefined> {
    return fromNulls(await db.query.User.findFirst({ where: eq(User.discordId, discordId) }));
}

export async function getUsersByDiscordIds(db: DatabaseClient, discordIds: string[]): Promise<User[]> {
    return fromNulls(await db.query.User.findMany({ where: inArray(User.discordId, discordIds) }));
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
    return fromNulls(
        await db
        .select({ id: User.id, discordUsername: User.discordUsername, discordNickname: User.discordNickname })
        .from(User)
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(eq(UserLan.lanId, lan.id))
    );
}

export async function createOrUpdateUser(db: DatabaseClient, data: UserData): Promise<User> {
    const existingUser = await getUserByDiscordId(db, data.discordId);
    if (existingUser) {
        return fromNulls((
            await db.update(User)
            .set(toNulls(data))
            .where(eq(User.id, existingUser.id))
            .returning()
        )[0]!);
    }
    return fromNulls((await db.insert(User).values(toNulls(data)).returning())[0]!);
}

export async function createOrUpdateSeatPickerUsers(db: DatabaseClient, data: UserData[]): Promise<User[]> {
    return fromNulls(await db.insert(User).values(toNulls(data)).onConflictDoUpdate({
        target: User.discordId,
        set: { seatPickerName: sql`excluded."seatPickerName"` },
    }).returning());
}

export async function updateUser(db: DatabaseClient, userId: number, data: Partial<User>) {
    await db.update(User).set(toNulls(data)).where(eq(User.id, userId));
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
    return fromNulls(await db.insert(Group).values(groups.map((name) => ({ name }))).onConflictDoUpdate({
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
    return fromNulls((await db.insert(Score).values({
        type: 'Awarded',
        lanId: lan.id,
        teamId: team?.id,
        userId: user?.id,
        assignerId: assigner.id,
        points: points,
        reason: reason,
        eventId: event?.id,
    }).returning())[0]!);
}

export async function countScores(db: DatabaseClient, lan: Lan, type: ScoreType | undefined) {
    const conditions = [eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));
    return (await db.select({ count: count() }).from(Score).where(and(...conditions)))[0]?.count || 0;
}

export async function countUserScores(db: DatabaseClient, lan: Lan, user: User, type: ScoreType | undefined) {
    const conditions = [eq(Score.userId, user.id), eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));
    return (await db.select({ count: count() }).from(Score).where(and(...conditions)))[0]?.count || 0;
}

export async function getScores(
    db: DatabaseClient, lan: Lan & LanTeams, type: ScoreType | undefined, page: number = 1,
): Promise<Array<Score & ScoreReferences>> {
    if (!lan) return [];

    const conditions = [eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));

    const Assigner = alias(User, 'Assigner');
    const data = fromNulls(
        await db.select({ score: Score, event: Event, assigner: Assigner, user: User, userLan: UserLan })
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
            user: item.user && item.user,
        }
    });
}

export async function getUserScores(
    db: DatabaseClient, lan: Lan & LanTeams, user: User, type?: ScoreType, page: number = 1,
): Promise<Array<Score & ScoreReferences>> {
    if (!lan) return [];

    const conditions = [
        eq(Score.userId, user.id),
        eq(Score.lanId, lan.id),
        or(isNotNull(Score.teamId), isNotNull(UserLan.teamId))];
    if (type) conditions.push(eq(Score.type, type));

    const Assigner = alias(User, 'Assigner');
    const data = fromNulls(
        await db.select({ score: Score, event: Event, assigner: Assigner, user: User, userLan: UserLan })
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
            user: item.user && item.user,
        }
    });
}

export async function getOrCreateHiddenCodeScore(
    db: DatabaseClient, user: User, code: HiddenCode,
): Promise<Score> {
    const score = fromNulls(await db.query.Score.findFirst({
        where: and(eq(Score.userId, user.id), eq(Score.hiddenCodeId, code.id)),
    }));
    if (score) return score;

    return fromNulls((await db.insert(Score).values({
        type: 'HiddenCode',
        userId: user.id,
        lanId: code.lanId,
        hiddenCodeId: code.id,
        points: HIDDEN_CODE_POINTS,
    }).returning())[0]!);
}

export async function getTeamPoints(db: DatabaseClient, lan: Lan, team: Team): Promise<number> {
    const results = (
        await db.select({ total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .leftJoin(User, eq(User.id, Score.userId))
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(and(
            eq(Score.lanId, lan.id),
            or(eq(Score.teamId, team.id), eq(UserLan.teamId, team.id)),
        ))
    );
    return results[0]!.total || 0;
}

export async function getUserPoints(db: DatabaseClient, lan: Lan, user: User): Promise<number> {
    const results = (
        await db.select({ total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .where(and(eq(Score.userId, user.id), eq(Score.lanId, lan.id)))
    );
    return results[0]!.total || 0;
}

export async function getEvents(db: DatabaseClient, lan: Lan): Promise<Event[]> {
    return fromNulls(await db.query.Event.findMany({
        where: and(
            eq(Event.isOfficial, true),
            eq(Event.lanId, lan.id)
        ),
        orderBy: [asc(Event.startTime)],
    }));
};

export async function getCurrentLan(db: DatabaseClient): Promise<Lan & LanTeams | undefined> {
    return fromNulls(await db.query.Lan.findFirst({
        where: gte(Lan.eventEnd, addDays(new Date(), -3)),
        orderBy: [asc(Lan.eventEnd)],
        with: { teams: true },
    }));
}

export const [getCurrentLanCached, clearCurrentLanCache] = cacheCall(getCurrentLan);

export async function getLans(db: DatabaseClient): Promise<Array<Lan & LanTeams>> {
    return fromNulls(await db.query.Lan.findMany({ orderBy: [asc(Lan.scheduleEnd)], with: { teams: true } }));
}

export const [getLansCached, clearLansCache] = cacheCall(getLans);

export async function getLan(db: DatabaseClient, lanId: number): Promise<Lan & LanTeams | undefined> {
    return fromNulls(await db.query.Lan.findFirst({ where: eq(Lan.id, lanId), with: { teams: true } }));
}

export async function createLan(db: DatabaseClient, data: Omit<Lan, 'id'>) {
    await db.insert(Lan).values(toNulls(data));

    clearCurrentLanCache();
    clearLansCache();
}

export async function updateLan(db: DatabaseClient, lan: Lan, data: LanData) {
    await db.update(Lan).set(toNulls(data)).where(eq(Lan.id, lan.id));

    clearCurrentLanCache();
    clearLansCache();
}

export async function endFinishedActivities(db: DatabaseClient, user: User, games: Game[]): Promise<void> {
    await db.update(GameActivity).set({ endTime: sql`NOW()` }).where(and(
        eq(GameActivity.userId, user.id),
        not(inArray(GameActivity.gameId, games.map((game) => game.id))),
        isNull(GameActivity.endTime),
    ));
}

export async function getOrCreateGames(
    db: DatabaseClient, activities: ApplicationActivity[],
): Promise<Game[]> {
    const existingIdentifiers = await db.query.GameIdentifier.findMany({
        where: inArray(GameIdentifier.id, activities.map((activity) => activity.applicationId)),
    });
    const existingApplicationIds = new Set(existingIdentifiers.map((item) => item.id));
    const missingActivities = activities.filter(
        ({ applicationId }) => !existingApplicationIds.has(applicationId),
    );

    const identifiedGames = fromNulls(await db.query.Game.findMany({
        where: inArray(Game.id, existingIdentifiers.map((item) => item.gameId))
    }));

    const activitiesById = lodash.keyBy(activities, 'applicationId');
    const activitiesByGameId = Object.fromEntries(
        existingIdentifiers.map((identifier) => [identifier.gameId, activitiesById[identifier.id]]),
    );
    for (const game of identifiedGames) {
        const activity = activitiesByGameId[game.id] as ApplicationActivity;
        if (game.name !== activity.name) {
            console.warn(`Warning: Activity "${activity.name}" conflicts with existing Game "${game.name}"`);
        }
    }

    identifiedGames.filter((game) => existingApplicationIds)

    if (missingActivities.length === 0) {
        return identifiedGames;
    }

    const existingGames = fromNulls(await db.query.Game.findMany({
        where: inArray(Game.name, missingActivities.map((item) => item.name))
    }));
    const existingGameNames = new Set(existingGames.map((item) => item.name));

    const missingGameActivities = missingActivities.filter(({ name }) => !existingGameNames.has(name));

    const createdGames = missingGameActivities.length > 0 ? fromNulls(
        await db.insert(Game)
        .values(missingGameActivities.map(({ name }) => ({ name })))
        .returning()
    ) : [];
    const nonIdentifiedGames = existingGames.concat(createdGames);
    const nonIdentifiedGamesByName = lodash.keyBy(nonIdentifiedGames, 'name');

    await db.insert(GameIdentifier).values(missingActivities.map(({ applicationId, name }) => {
        return {
            id: applicationId,
            gameId: nonIdentifiedGamesByName[name]!.id,
        };
    })).returning();

    return identifiedGames.concat(nonIdentifiedGames);
}

export async function getGame(db: DatabaseClient, gameId: number): Promise<Game | undefined> {
    return fromNulls(await db.query.Game.findFirst({ where: eq(Game.id, gameId) }));
}

export async function getGameWithDuplicates(db: DatabaseClient, gameId: number): Promise<GameWithDuplicates | undefined> {
    return fromNulls(await db.query.Game.findFirst({
        where: eq(Game.id, gameId),
        with: { duplicates: true },
    }));
}

export async function getGamesWithDuplicates(db: DatabaseClient): Promise<GameWithDuplicates[]> {
    return fromNulls(await db.query.Game.findMany({
        where: isNull(Game.parentId),
        with: { duplicates: true },
        orderBy: [Game.name],
    }));
}

export async function getGames(db: DatabaseClient): Promise<Game[]> {
    return fromNulls(await db.query.Game.findMany({ where: isNull(Game.parentId), orderBy: [Game.name] }));
}

export async function updateGame(db: DatabaseClient, gameId: number, data: Partial<Game>): Promise<void> {
    await db.update(Game).set(toNulls(data)).where(eq(Game.id, gameId));
}

export async function getGameActivity(
    db: DatabaseClient, lan: Lan, user: User, game: Game,
): Promise<GameActivity | undefined> {
    return fromNulls(await db.query.GameActivity.findFirst({
        where: and(
            eq(GameActivity.lanId, lan.id),
            eq(GameActivity.userId, user.id),
            eq(GameActivity.gameId, game.id),
        ),
    }));
}

export async function createGameActivity(
    db: DatabaseClient, lan: Lan, user: User, game: Game, startTime: Date,
) {
    return (await db.insert(GameActivity).values({
        lanId: lan.id,
        userId: user.id,
        gameId: game.id,
        startTime: startTime,
    }).returning())[0];
}

export async function getOrCreateGameActivity(
    db: DatabaseClient, lan: Lan, user: User, game: Game, startTime: Date,
) {
    const gameActivity = await getGameActivity(db, lan, user, game);
    if (gameActivity) return gameActivity;
    await createGameActivity(db, lan, user, game, startTime);
}

export async function getTimeslotActivities(
    db: DatabaseClient, lan: Lan, event: Event, eventTimeslot: EventTimeslot,
): Promise<GameActivityWithTeam[]> {
    if (!event.gameId) return [];
    return fromNulls(
        await db.select({
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
    return fromNulls(await db.query.Event.findMany({
        where: and(
            eq(Event.lanId, lan.id),
            eq(Event.isCancelled, false),
            isNotNull(Event.gameId),
            gt(Event.points, sql`0`),
            gt(sql`NOW()`, Event.startTime),
            lt(Event.timeslotCount, sql`FLOOR(${Event.duration} / ${EVENT_TIMESLOT_MINUTES})`),
        ),
        with: { timeslots: { orderBy: [asc(EventTimeslot.time)] }},
    }));
}

export async function getOrCreateIntroChallenge(
    db: DatabaseClient, type: IntroChallengeType, lan: Lan, user: User,
): Promise<IntroChallenge> {
    const challenge = fromNulls(await db.query.IntroChallenge.findFirst({
        where: and(eq(IntroChallenge.type, type), eq(IntroChallenge.userId, user.id)),
    }));
    if (challenge) return challenge;
    return fromNulls((await db.insert(IntroChallenge).values({
        lanId: lan.id, userId: user.id, type: type,
    }).returning())[0]!);
}

type IntroChallengeMap = {
    [Key in IntroChallengeType]?: IntroChallenge
};

export async function getIntroChallenges(
    db: DatabaseClient, lan: Lan, user: User | undefined,
): Promise<IntroChallengeMap> {
    const challenges: IntroChallengeMap = Object.fromEntries(INTRO_CHALLENGE_TYPES.map((type) => [type, undefined]));
    if (user && lan) {
        const introChallenges = fromNulls(await db.query.IntroChallenge.findMany({
            where: and(eq(IntroChallenge.userId, user.id), eq(IntroChallenge.lanId, lan.id)),
        }));
        for (const introChallenge of introChallenges) {
            challenges[introChallenge.type] = introChallenge;
        }
    }
    return challenges;
}

export async function claimChallenge(db: DatabaseClient, lan: Lan, user: User, challengeId: number) {
    const introChallenge = fromNulls(await db.query.IntroChallenge.findFirst({
        where: and(
            eq(IntroChallenge.lanId, lan.id),
            eq(IntroChallenge.userId, user.id),
            eq(IntroChallenge.id, challengeId),
        ),
    }));
    if (!introChallenge) throw new Error('Challenge not completed yet');

    const score = fromNulls((await db.insert(Score).values({
        type: 'IntroChallenge',
        lanId: lan.id,
        userId: user.id,
        points: INTRO_CHALLENGE_POINTS[introChallenge.type],
    }).returning())[0]!);

    await db.update(IntroChallenge).set({ scoreId: score.id }).where(eq(IntroChallenge.id, challengeId));
}

export async function getOrCreateUserLan(db: DatabaseClient, user: User, lan: Lan): Promise<UserLan> {
    const userLan = fromNulls(await db.query.UserLan.findFirst({
        where: and(eq(UserLan.userId, user.id), eq(UserLan.lanId, lan.id)),
    }));
    if (userLan) return userLan;

    return fromNulls((await db.insert(UserLan).values({ userId: user.id, lanId: lan.id }).returning())[0]!);
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

export async function getHiddenCodes(db: DatabaseClient, lan: Lan) {
    const data = fromNulls(await db.query.HiddenCode.findMany({
        where: eq(HiddenCode.lanId, lan.id),
        orderBy: [HiddenCode.number],
    }));
    return data.map((item) => ({ ...item, url: absoluteUrl(`/code/${item.code}`) }));
}

export async function getHiddenCode(
    db: DatabaseClient, lan: Lan, hiddenCodeId: number,
): Promise<HiddenCode & HiddenCodeUrl | undefined> {
    const data = fromNulls(await db.query.HiddenCode.findFirst({
        where: and(eq(HiddenCode.id, hiddenCodeId), eq(HiddenCode.lanId, lan.id)),
    }));
    return data ? { ...data, url: absoluteUrl(`/code/${data.code}`) } : undefined;
}

export async function getHiddenCodeByCode(
    db: DatabaseClient, lan: Lan, hiddenCode: string,
): Promise<HiddenCode & HiddenCodeUrl | undefined> {
    const data = fromNulls(await db.query.HiddenCode.findFirst({
        where: and(eq(HiddenCode.code, hiddenCode), eq(HiddenCode.lanId, lan.id)),
    }));
    return data ? { ...data, url: absoluteUrl(`/code/${data.code}`) } : undefined;
}


export async function createHiddenCode(db: DatabaseClient, lan: Lan, data: HiddenCodeData) {
    await db.transaction(async (tx) => {
        const maxNumber = (
            await tx.select({ value: max(HiddenCode.number) })
            .from(HiddenCode)
            .where(eq(HiddenCode.lanId, lan.id))
        )[0]?.value || 0;

        await tx.insert(HiddenCode).values({
            ...toNulls(data), lanId: lan.id, number: maxNumber + 1, code: randomCode(),
        });
    });
}

export async function updateHiddenCode(db: DatabaseClient, lan: Lan, code: HiddenCode, data: HiddenCodeData) {
    await db.update(HiddenCode).set(toNulls(data)).where(eq(HiddenCode.id, code.id));
}

export async function findSecretScoreByLan(db: DatabaseClient, lan: Lan, secretNumber: number) {
    return fromNulls(await db.query.Score.findFirst({
        where: and(eq(Score.type, 'Secret'), eq(Score.lanId, lan.id), eq(Score.secretNumber, secretNumber))
    }));
}

export async function createSecretScore(db: DatabaseClient, lan: Lan, user: User, secretNumber: number) {
    await db.insert(Score).values({
        type: 'Secret',
        lanId: lan.id,
        userId: user.id,
        points: SECRET_POINTS,
        secretNumber,
    });
}
