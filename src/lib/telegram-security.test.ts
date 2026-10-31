import { expect, it } from 'vitest';
import { hashTeamPassword, verifyTeamPassword } from './telegram-security.server';
it('only the correct team password verifies and storage is not plaintext', () => {
  const password = 'team-test-password';
  const result = hashTeamPassword(password);
  expect(result.hash).not.toBe(password);
  expect(verifyTeamPassword(password, result.salt, result.hash)).toBe(true);
  expect(verifyTeamPassword('incorrect-password', result.salt, result.hash)).toBe(false);
});