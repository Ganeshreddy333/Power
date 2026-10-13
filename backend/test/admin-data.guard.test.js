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

  it('keeps abstract asset uploads public but requires admin authentication for management images', async () => {
    const guard = new AdminDataGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ role: 'admin', sub: 'admin-1' }) },
      { getOrThrow: jest.fn().mockReturnValue('secret') },
    );
    const contextFor = (request) => ({ switchToHttp: () => ({ getRequest: () => request }) });
    const abstractUpload = {
      method: 'POST',
      path: '/storage/abstract-assets/upload',
      params: { bucket: 'abstract-assets' },
      headers: {},
    };
    const imageUpload = {
      method: 'POST',
      path: '/storage/speaker-images/upload',
      params: { bucket: 'speaker-images' },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(abstractUpload))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(imageUpload))).rejects.toThrow('An administrator session is required');

    imageUpload.headers.authorization = 'Bearer admin-token';
    await expect(guard.canActivate(contextFor(imageUpload))).resolves.toBe(true);
    expect(imageUpload.isAdmin).toBe(true);
  });
});
