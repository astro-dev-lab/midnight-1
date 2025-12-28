const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // Internal users (Dashboard One)
  await prisma.user.upsert({
    where: { email: 'admin@studioos.test' },
    update: {},
    create: {
      email: 'admin@studioos.test',
      passwordHash,
      internalRole: 'ADVANCED'
    },
  });

  await prisma.user.upsert({
    where: { email: 'producer@studioos.test' },
    update: {},
    create: {
      email: 'producer@studioos.test',
      passwordHash,
      internalRole: 'STANDARD'
    },
  });

  await prisma.user.upsert({
    where: { email: 'basic@studioos.test' },
    update: {},
    create: {
      email: 'basic@studioos.test',
      passwordHash,
      internalRole: 'BASIC'
    },
  });

  // External users (Dashboard Two - Client Portal)
  await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      passwordHash,
      externalRole: 'APPROVER'
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@example.com' },
    update: {},
    create: {
      email: 'viewer@example.com',
      passwordHash,
      externalRole: 'VIEWER'
    },
  });

  console.log('Seeded test users:');
  console.log('  Internal: admin@studioos.test, producer@studioos.test, basic@studioos.test');
  console.log('  External: client@example.com, viewer@example.com');
  console.log('  Password for all: password123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
