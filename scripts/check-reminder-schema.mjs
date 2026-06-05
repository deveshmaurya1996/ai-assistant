import { PrismaClient } from '../packages/database/generated/prisma/index.js';

const prisma = new PrismaClient();
try {
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Reminder' ORDER BY ordinal_position`;
  console.log('columns:', cols.map((c) => c.column_name));
  const count = await prisma.reminder.count();
  console.log('reminder count:', count);
} finally {
  await prisma.$disconnect();
}
