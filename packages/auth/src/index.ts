import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { expo } from '@better-auth/expo';
import { prisma } from '@ai-assistant/database';
import { config } from '@ai-assistant/config';

export { getSessionFromHeaders } from './session';

const googleConfigured =
  Boolean(config.googleClientId) && Boolean(config.googleClientSecret);

const trustedOrigins = [
  config.betterAuthUrl,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://10.0.2.2:3000',
  'exp://localhost:8081',
  'exp://',
  'ai-assistant://',
];

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: config.betterAuthSecret,
  baseURL: config.betterAuthUrl,
  trustedOrigins,
  plugins: [expo()],
  emailAndPassword: {
    enabled: true,
  },
  ...(googleConfigured
    ? {
        socialProviders: {
          google: {
            clientId: config.googleClientId!,
            clientSecret: config.googleClientSecret!,
          },
        },
      }
    : {}),
});

export type Auth = typeof auth;
