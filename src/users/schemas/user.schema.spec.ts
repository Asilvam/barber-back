import { UserSchema } from './user.schema';

describe('UserSchema security', () => {
  it('keeps access reasons and administrator history out of ordinary user queries', () => {
    expect(UserSchema.path('bookingAccessHistory').options.select).toBe(false);
  });
  it('marks passwordHash as non-selectable by default', () => {
    const passwordPath = UserSchema.path('passwordHash');

    expect(passwordPath.options.select).toBe(false);
  });
});
