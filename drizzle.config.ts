import { defineConfig } from 'drizzle-kit';

import { DATABASE_URL } from './backend/environment.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './backend/schema.ts',
  dbCredentials: { url: DATABASE_URL },
});
