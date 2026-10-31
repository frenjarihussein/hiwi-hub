import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
export function hashTeamPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex') };
}
export function verifyTeamPassword(password: string, salt: string, hash: string) {
  const supplied = Buffer.from(hashTeamPassword(password, salt).hash, 'hex');
  const expected = Buffer.from(hash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}