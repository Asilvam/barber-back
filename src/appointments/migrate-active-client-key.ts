import 'dotenv/config';
import { createConnection, Types } from 'mongoose';
import { Appointment, AppointmentSchema } from './entities/appointment.schema';
import { User, UserRole, UserSchema } from '../users/schemas/user.schema';
import { getSantiagoDateTime } from '../common/time/santiago-time';

// Run with booking writes paused. Dry run by default; --apply enables updates.
export async function migrateActiveClientKeys(uri: string, apply = false) {
  const connection = await createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
  try {
    const appointments = connection.model(Appointment.name, AppointmentSchema);
    const users = connection.model(User.name, UserSchema);
    const records = await appointments.find().select('+activeClientKey').lean().exec();
    const clients = await users.find().select('_id role').lean().exec();
    const roles = new Map(clients.map((client) => [client._id.toString(), client.role]));
    const { today, currentTime } = getSantiagoDateTime();
    const owners = new Set<string>();
    const changes: { id: Types.ObjectId; key?: string }[] = [];
    let duplicates = 0;
    let orphans = 0;
    let active = 0;
    for (const record of records) {
      const clientId = (record.clientId as Types.ObjectId).toString();
      const future = record.date > today || (record.date === today && record.timeSlot > currentTime);
      const eligible = ['pending', 'confirmed'].includes(record.status) && future;
      let key: string | undefined;
      if (eligible) {
        if (!roles.has(clientId)) orphans += 1;
        else if (roles.get(clientId) !== UserRole.ADMIN) {
          key = clientId;
          active += 1;
          if (owners.has(key)) duplicates += 1;
          owners.add(key);
        }
      }
      if (record.activeClientKey !== key) changes.push({ id: record._id, key });
    }
    const summary = { total: records.length, activeClients: active, changes: changes.length, duplicates, orphans, applied: false };
    if (duplicates || orphans || !apply) return summary;
    // The index rejects conflicts even if a competing write slips in during migration.
    await appointments.collection.createIndex({ activeClientKey: 1 }, { name: 'unique_active_client_key', unique: true, sparse: true });
    for (const change of changes) {
      await appointments.updateOne({ _id: change.id }, change.key ? { $set: { activeClientKey: change.key } } : { $unset: { activeClientKey: 1 } }).exec();
    }
    return { ...summary, applied: true };
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  migrateActiveClientKeys(uri, process.argv.includes('--apply'))
    .then((summary) => {
      console.log(JSON.stringify(summary));
      if (summary.duplicates || summary.orphans) process.exitCode = 1;
    })
    .catch(() => {
      console.error('Migration failed. Connection details omitted; inspect the database before retrying.');
      process.exitCode = 1;
    });
}
