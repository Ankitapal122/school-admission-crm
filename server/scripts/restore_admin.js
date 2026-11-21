require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function restore() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: 'adminboarding123@gmail.com' },
        { role: 'SUPER_ADMIN' },
        { role: 'super_admin' },
      ],
    },
  });

  console.log('Current status of admin users:');
  for (const u of users) {
    console.log(`- ${u.email} (${u.role}): status=${u.status}, isActive=${u.isActive}, lockedUntil=${u.lockedUntil}`);
  }

  const updated = await prisma.user.updateMany({
    where: {
      OR: [
        { email: 'adminboarding123@gmail.com' },
        { role: 'SUPER_ADMIN' },
        { role: 'super_admin' },
      ],
    },
    data: {
      status: 'active',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`Successfully reactivated ${updated.count} admin user(s).`);
}

restore()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
