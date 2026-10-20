import { model, Types } from 'mongoose';
import { AppointmentSchema } from './appointment.schema';

describe('AppointmentSchema indexes', () => {
  it('enforces uniqueness only for slotKey values managed by the backend', () => {
    const indexes = AppointmentSchema.indexes();
    const slotIndex = indexes.find(([fields]) => fields.slotKey === 1);
    const legacyIndex = indexes.find(([fields]) => fields.barberId === 1 && fields.date === 1 && fields.timeSlot === 1);

    expect(slotIndex?.[1]).toMatchObject({
      name: 'unique_appointment_slot_key',
      unique: true,
      sparse: true,
    });
    expect(legacyIndex).toBeUndefined();
  });
  it('enforces a unique optional client key for active reservations', () => {
    const index = AppointmentSchema.indexes().find(([fields]) => fields.activeClientKey === 1);
    expect(index?.[1]).toMatchObject({ name: 'unique_active_client_key', unique: true, sparse: true });
  });
  it('creates reservations pending approval by default', () => {
    const AppointmentModel = model('AppointmentPendingApprovalTest', AppointmentSchema);
    const appointment = new AppointmentModel({
      clientId: new Types.ObjectId(),
      barberId: new Types.ObjectId(),
      date: '2026-11-01',
      timeSlot: '10:00',
    });
    expect(appointment.status).toBe('pending');
  });
});
