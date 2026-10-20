import { UsersService } from './users.service';
import { UserRole } from './schemas/user.schema';
const query = (value: unknown) => ({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(value) });
describe('Client booking access', () => {
  const id = '507f1f77bcf86cd799439011';
  const actorId = '507f1f77bcf86cd799439012';
  function setup(result: unknown = { _id: id, isBookingBlocked: true }, role = UserRole.ADMIN) {
    const model = { find: jest.fn().mockReturnValue(query([])), findById: jest.fn().mockReturnValue(query({ role, name: 'Admin' })), findOneAndUpdate: jest.fn().mockReturnValue(query(result)) };
    const service = new UsersService(model as unknown as ConstructorParameters<typeof UsersService>[0]);
    return { service, model };
  }
  it('lists only clients and explicitly includes private history for administration', async () => {
    const { service, model } = setup();
    await service.findClients();
    expect(model.find).toHaveBeenCalledWith({ role: UserRole.USER });
    expect((model.find.mock.results[0].value as ReturnType<typeof query>).select).toHaveBeenCalledWith('+bookingAccessHistory');
  });
  it.each([true, false])('atomically changes blocked=%s and appends the administrator and reason', async (blocked) => {
    const { service, model } = setup();
    await service.setBookingAccess(id, blocked, 'Motivo interno', actorId);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, role: UserRole.USER, isBookingBlocked: blocked ? { $ne: true } : true },
      { $set: { isBookingBlocked: blocked }, $push: { bookingAccessHistory: { blocked, reason: 'Motivo interno', actorId, actorName: 'Admin', at: expect.any(Date) as unknown } } },
      { returnDocument: 'after', runValidators: true },
    );
  });
  it('rejects stale changes without appending duplicate history', async () => {
    const { service } = setup(null);
    await expect(service.setBookingAccess(id, true, 'Motivo', actorId)).rejects.toThrow('estado ya cambió');
  });
  it('rejects an invalid client id before accessing the database', async () => {
    const { service, model } = setup();
    await expect(service.setBookingAccess('invalid', true, 'Motivo', actorId)).rejects.toThrow('Cliente inválido');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects an actor who is no longer an administrator', async () => {
    const { service, model } = setup({}, UserRole.USER);
    await expect(service.setBookingAccess(id, true, 'Motivo', actorId)).rejects.toThrow('Administrador inválido');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
