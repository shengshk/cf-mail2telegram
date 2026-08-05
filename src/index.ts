import type { Environment } from './types';
import { fetchHandler } from './handler/fetch';
import { emailHandler } from './handler/mail';
import './polyfill';

export default {
    async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
        return fetchHandler(request, env, ctx);
    },
    email: emailHandler,
};
