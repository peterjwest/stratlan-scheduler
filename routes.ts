import { buildQueryString } from './util';

type ExtractParams<Value extends string> = (
    Value extends `${infer _Start}/:${infer Param}/${infer End}`
    ? [string | number, ...ExtractParams<`/${End}`>]
    : (Value extends `${infer _Start}/:${infer Param}` ? [string | number] : [])
);

export function routeUrl<Value extends string>(route: Value, ...args: [...ExtractParams<Value>, Record<string, string>?]): string {
    const paramNames = route.match(/:[^\/]+/g) || [];
    const index = args.findIndex((arg) => typeof arg !== 'string' && typeof arg !== 'number');
    const params = (index === -1 ? args : args.slice(0, index)) as ExtractParams<Value>;
    const query = (index === -1 ? undefined : args[index]) as Record<string, string> | undefined;

    const queryString = buildQueryString(query);
    let url: string = route;
    for (let i = 0; i < paramNames.length; i++) {
        url = url.replace(paramNames[i]!, String(params[i]!));
    }
    return `${url}${queryString ? '?' + queryString : ''}`;
}

export default {
    home: '/',
    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
    },
    dashboard: '/dashboard',
    schedule: '/schedule',
    intro: {
        code: '/intro/code/:userCode',
        claim: '/intro/claim/:challengeId',
    },
    code: '/code/:hiddenCode',
    secret: '/secret/:secretCode',
    steam: {
        login: '/steam',
        authenticate: '/steam/authenticate',
    },
    admin: {
        lans: {
            list: '/admin/lans',
            get: '/admin/lans/:lanId',
            create: '/admin/lans/create',
        },
        players: {
            list: '/admin/players',
            randomise: '/admin/players/randomise',
            get: '/admin/players/:playerId',
            switch: '/admin/players/:playerId/switch',
        },
        events: {
            list: '/admin/events',
            get: '/admin/events/:eventId',
            create: '/admin/events/create',
        },
        points: {
            list: '/admin/points',
            create: '/admin/points/create',
        },
        codes: {
            list: '/admin/codes',
            get: '/admin/codes/:codeId',
            create: '/admin/codes/create',
        },
        games: {
            list: '/admin/games',
            get: '/admin/games/:gameId',
            create: '/admin/games/create',
            duplicates: {
                create: '/admin/games/:gameId/duplicates/create',
                delete: '/admin/games/:gameId/duplicates/:duplicateId/delete',
            },
        },
    }
} as const;
