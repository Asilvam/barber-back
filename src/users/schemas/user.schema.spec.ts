import { UserSchema } from './user.schema';

describe('UserSchema security', () => {
  it('marks passwordHash as non-selectable by default', () => {
    const passwordPath = UserSchema.path('passwordHash');

    expect(passwordPath.options.select).toBe(false);
  });
});
