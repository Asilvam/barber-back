import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserRole } from './schemas/user.schema';

describe('UsersController security', () => {
  const usersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const controller = new UsersController(usersService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies reading another user when requester is not admin', () => {
    expect(() =>
      controller.findOne('target-user-id', {
        user: { userId: 'other-user-id', role: UserRole.USER },
      } as any),
    ).toThrow(ForbiddenException);
  });

  it('allows self profile update for non-admin user without role change', () => {
    usersService.update.mockReturnValue({ id: 'self-id' });

    const result = controller.update(
      'self-id',
      { name: 'Updated' },
      {
        user: { userId: 'self-id', role: UserRole.USER },
      } as any,
    );

    expect(usersService.update).toHaveBeenCalledWith('self-id', { name: 'Updated' });
    expect(result).toEqual({ id: 'self-id' });
  });

  it('denies self role escalation for non-admin user', () => {
    expect(() =>
      controller.update(
        'self-id',
        { role: UserRole.ADMIN },
        {
          user: { userId: 'self-id', role: UserRole.USER },
        } as any,
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin to remove any user', () => {
    usersService.remove.mockReturnValue({ id: 'target-user-id' });

    const result = controller.remove(
      'target-user-id',
      {
        user: { userId: 'admin-id', role: UserRole.ADMIN },
      } as any,
    );

    expect(usersService.remove).toHaveBeenCalledWith('target-user-id');
    expect(result).toEqual({ id: 'target-user-id' });
  });
});
