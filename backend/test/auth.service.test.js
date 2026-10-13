const bcrypt = require('bcryptjs');
const { AuthService } = require('../src/auth/auth.service');

describe('AuthService admin-only authentication', () => {
  it('allows an administrator with valid credentials to log in', async () => {
    const user = {
      id: 'admin-1',
      email: 'admin@example.test',
      password: bcrypt.hashSync('correct-password', 4),
      firstName: 'Conference',
      lastName: 'Admin',
      role: 'admin',
    };
    const usersService = { findByEmail: jest.fn().mockResolvedValue(user) };
    const jwtService = { sign: jest.fn().mockReturnValue('admin-token') };
    const service = new AuthService(jwtService, usersService);

    await expect(service.login(user.email, 'correct-password')).resolves.toEqual({
      accessToken: 'admin-token',
      user: {
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Conference',
        lastName: 'Admin',
        role: 'admin',
      },
    });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'admin-1',
      email: user.email,
      role: 'admin',
    });
  });

  it('rejects non-admin accounts even when their password is valid', async () => {
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'attendee@example.test',
        password: bcrypt.hashSync('correct-password', 4),
        role: 'user',
      }),
    };
    const jwtService = { sign: jest.fn() };
    const service = new AuthService(jwtService, usersService);

    await expect(service.login('attendee@example.test', 'correct-password'))
      .rejects.toThrow('Invalid credentials');
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
