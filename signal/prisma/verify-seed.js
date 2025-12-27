const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function verify(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`${email}: NOT FOUND`);
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (ok) {
    console.log(`${email}: OK (role=${user.role})`);
  } else {
    console.log(`${email}: INVALID PASSWORD`);
  }
}

(async () => {
  await verify('admin-test', 'password-test');
  await verify('user-test', 'password-test');
  await prisma.$disconnect();
})();
