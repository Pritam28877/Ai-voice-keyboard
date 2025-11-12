import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hashed: string) {
  if (!hashed) {
    return false;
  }
  return bcrypt.compare(plain, hashed);
}

