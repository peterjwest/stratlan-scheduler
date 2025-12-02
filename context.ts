import { Request } from 'express';

import { User, UserTeams, Lan, LanTeams, LanProgress } from './schema.js';
import { Helpers } from './helpers.js';
import routes from './routes.js';

export type Context = {
    currentPath: string;
    currentUrl: string;
    routes: typeof routes;
    nonce: string;
    csrfToken: string;
    discordAuthUrl: string;
    user: User & UserTeams | undefined;
    points: number | undefined;
    isAdmin: boolean;
    currentLan: Lan & LanTeams & LanProgress | undefined;
    lans: Array<Lan & LanTeams>;
    helpers: Helpers & {
        absoluteUrl: (url: string) => string,
        assetUrl: (path: string) => string,
    };
}

type ContextWithLan = Context & {
    currentLan: Lan & LanTeams;
}

type ContextLoggedIn = ContextWithLan & {
    user: User & UserTeams;
}

export function getContext(request: Request): Context;
export function getContext(request: Request, _mode: 'WITH_LAN'): ContextWithLan;
export function getContext(request: Request, _mode: 'LOGGED_IN'): ContextLoggedIn;
export function getContext(request: Request, _mode?: 'WITH_LAN' | 'LOGGED_IN'): Context | ContextLoggedIn   {
    return request.context;
}
