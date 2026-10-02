const { AdminDataGuard } = require('../src/data/admin-data.guard');

describe('AdminDataGuard public speaker profiles', () => {
  it('allows an exact-ID GET profile route without an admin session', async () => {
    const guard = new AdminDataGuard(
      { verifyAsync: jest.fn() },
      { getOrThrow: jest.fn() },
    );
    const request = {
      method: 'GET',
      path: '/data/speakers/speaker-123/profile',
      route: { path: '/data/speakers/:id/profile' },
      params: { id: 'speaker-123' },
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.isAdmin).toBe(false);
  });

  it('continues to require administrator authentication for speaker writes', async () => {
    const guard = new AdminDataGuard(
      { verifyAsync: jest.fn() },
      { getOrThrow: jest.fn() },
    );
    const request = {
      method: 'POST',
      path: '/data/speakers',
      params: { table: 'speakers' },
      headers: {},
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };

    await expect(guard.canActivate(context)).rejects.toThrow('An administrator session is required');
  });
});
