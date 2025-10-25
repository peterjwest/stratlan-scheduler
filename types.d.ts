import { Context } from './context';

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
        }
    }
}
