const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password-test', 10);

  await prisma.user.upsert({
    where: { email: 'admin-test' },
    update: {},
    create: {
      email: 'admin-test',
      passwordHash,
      role: 'ADMIN'
    },
  });

  await prisma.user.upsert({
    where: { email: 'user-test' },
    update: {},
    create: {
      email: 'user-test',
      passwordHash,
      role: 'USER'
    },
  });

  console.log('Seeded admin-test and user-test');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
