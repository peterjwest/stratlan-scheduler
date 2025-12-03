import { Cookies } from 'cookie';
import "@total-typescript/ts-reset";

import { Context } from './backend/context.js';

/** Augments the session with userId */
declare module 'express-session' {
    interface SessionData {
        userId: number;
    }
}

declare global {
    namespace Express {
        interface Request {
            context: Context;
            cookies: Cookies;
        }
        interface Response {
            sentry: string;
        }
    }
}

declare module 'express' {
    interface Request {
        context: Context;
        cookies: Cookies;
    }
    interface Response {
        sentry: string;
    }
}
