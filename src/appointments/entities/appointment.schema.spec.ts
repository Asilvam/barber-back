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
});
