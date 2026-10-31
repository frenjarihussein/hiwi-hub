import { describe, expect, it } from 'vitest';
import { withAppDatabase } from './app-database';

describe('application database contract adapter', () => {
  it('retains the exact managed client and its authentication and transport', () => {
    const auth = { getSession: () => 'existing session' };
    const from = () => 'existing query';
    const client = { auth, from };
    const adapted = withAppDatabase(client);
    expect(adapted).toBe(client);
    expect(adapted.auth).toBe(auth);
    expect(adapted.from).toBe(from);
  });
});