import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const logQueries = process.env.PRISMA_LOG_QUERIES === 'true';

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: logQueries ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { Prisma };
export * from '@prisma/client';
