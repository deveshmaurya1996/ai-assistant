/**
 * One-time audit: find Reminder rows that look like inbox/digest automations.
 * Usage: node scripts/with-env.mjs node scripts/audit-misstored-digest-reminders.mjs
 */
import { PrismaClient } from '../packages/database/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT id, "userId", "userPrompt", recurrence, "cronExpression", payload
    FROM "Reminder"
    WHERE "deletedAt" IS NULL
      AND (
        "userPrompt" ILIKE '%inbox%'
        OR "userPrompt" ILIKE '%digest%'
        OR (payload->>'title') ILIKE '%digest%'
        OR (payload->>'title') ILIKE '%inbox%'
      )
  `;
  console.log(JSON.stringify(rows, null, 2));
  console.log(`Found ${rows.length} candidate row(s).`);
} finally {
  await prisma.$disconnect();
}
