const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/database.js');

const register = async ({ username, email, password, fullName }) => {
  const exists = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] }
  });
  if (exists) throw Object.assign(new Error('Username atau email sudah terdaftar'), { statusCode: 409 });

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, password: hashed, fullName },
    select: { id: true, username: true, email: true, fullName: true, createdAt: true }
  });

  return user;
};

const login = async ({ login: loginField, password }) => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: loginField }, { email: loginField }] },
    include: {
      userRoles: { include: { role: true } }
    }
  });

  if (!user || !user.isActive) throw Object.assign(new Error('Kredensial tidak valid'), { statusCode: 401 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Kredensial tidak valid'), { statusCode: 401 });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles: user.userRoles.map(ur => ur.role.code),
    }
  };
};

module.exports = { register, login };
