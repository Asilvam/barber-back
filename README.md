## Barber Back API

NestJS backend with local and Google auth, JWT, MongoDB, and Swagger docs.

## Security rollout

- Backend-first security execution guide: `docs/SECURITY_PHASE0.md`
- PRs should follow the security template in `.github/PULL_REQUEST_TEMPLATE.md`

## Features

- Local auth (register/login)
- Google Identity Services login
- JWT authentication
- Role-Based Access Control (RBAC) for Admin operations
- MongoDB (Mongoose) with schemas for Users, Barbers, Appointments, and **Barber Schedules**
- CRUD operations for Users, Barbers, Appointments, and **Barber Schedules**
- Appointment scheduling logic (available slots, conflict detection)
- Transactional email for appointment creation and active appointment cancellation
- Swagger docs

## Requirements

- Node.js 24.22.0 (`.nvmrc`); the supported major version is 24.x.
- npm 11.x (validated with 11.19.1).
- nvm to select the version specified by the project.
- MongoDB

## Setup

```bash
nvm install
nvm use
npm ci
```

Run these commands from the repository root. `npm ci` installs the versions in
`package-lock.json`; use `npm install` when intentionally changing dependencies.
The reviewed dependency install-script decisions are stored in `allowScripts`
in `package.json`.

Create a `.env` in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/barber
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=replace_with_a_strong_secret
JWT_EXPIRES_IN=1d
CORS_ORIGIN=http://localhost:5173
EMAIL_SERVICE_URL=http://localhost:3001
EMAIL_SERVICE_API_KEY=replace_with_the_same_key_used_by_email_send_microservice
EMAIL_SERVICE_TIMEOUT_MS=5000
EMAIL_FROM_NAME=Barber
```

Notes:

- `JWT_SECRET` is required and cannot be `change_me`.
- `CORS_ORIGIN` must be an explicit origin or comma-separated allowlist (no `*`).
- `EMAIL_SERVICE_URL` is the public/base URL of `email-send-microservice`.
- `EMAIL_SERVICE_API_KEY` must match the microservice's `INTERNAL_API_KEY`.
- `EMAIL_FROM_NAME` controls the sender display name used by appointment emails.

## Security hardening

- `helmet` enabled globally.
- Global rate limit enabled (`60 req/min`), with stricter limits on auth routes:
  - `POST /auth/register`: `5 req/min`
  - `POST /auth/login`: `5 req/min`
  - `POST /auth/google`: `10 req/min`
- `passwordHash` is not selectable by default and is sanitized from serialized user objects.
- `GET/PATCH/DELETE /users/:id` now allow only `self` or `admin`.
- `GET /appointments/:id` now allows only appointment owner or admin.
- Appointment create/update now maps Mongo duplicate key (`E11000`) to `409 Conflict`.

## Appointment lifecycle

- Creating an appointment assigns an internal `slotKey` and sends a pending-approval email.
- Changing an active appointment to `cancelled` removes its `slotKey`, releases the block, and emails the client.
- Cancellation by administration also emails the client for past appointments; client cancellation still requires at least 12 hours of notice. The message identifies who cancelled.
- `completed` appointments retain their `slotKey`; expired blocks cannot be booked again.
- Email delivery failures are logged and never roll back appointment creation, confirmation, or cancellation.
- `DELETE /appointments/:id` archives only cancelled or completed records, retaining status, history, archive date and administrator. It sends no email. The default list excludes archived records; administrators can use `GET /appointments?includeArchived=true` for client history.
- Appointment expiration is evaluated in the `America/Santiago` timezone.

## Active reservation concurrency

`activeClientKey` is an internal, uniquely indexed field. Future pending or
confirmed reservations hold this key for non-admin clients. Cancellation and
completion remove it; a new booking also releases keys for appointments that
have reached their start time. `slotKey` independently protects each barber slot.
Conflicts return HTTP 409. Administrators retain their multiple-reservation exception.

For an existing database, pause booking writes while running the migration.
It uses `MONGODB_URI` from the environment or `.env` and never deletes reservations:

```bash
npm run build
# Inspect only; duplicates or orphaned clients prevent application
node dist/appointments/migrate-active-client-key.js
# Apply only after reviewing the diagnostic result
node dist/appointments/migrate-active-client-key.js --apply
```

MongoDB integration tests use uniquely named `qa_booking_` collections and remove
only those collections afterwards. They use `BARBER_TEST_MONGODB_URI`, or fall back
to `MONGODB_URI`. They do not send email. Run only the concurrency suite with:

```bash
npm run test:e2e -- --runInBand --testPathPatterns=appointments-concurrency
```

The latest concurrency run passed 8 integration tests, including simultaneous
requests synchronized after their initial availability checks.

## Run

```bash
npm run start:dev
```

## Verification

```bash
# Static analysis without modifying files
npx --no-install eslint "{src,apps,libs,test}/**/*.ts" --max-warnings 0

# Compile the application
npm run build

# Unit tests
npm test -- --runInBand

# Dependency security advisories
npm audit
```

`npm run lint` includes `--fix` and can modify source files; use the command above
for a read-only check. The latest unit-test run passed 54 tests across 8 suites.
Date-sensitive appointment tests use a controlled clock. Unit tests use mocks;
they do not establish that a deployed database or email service is reachable.

The latest dependency audit reported 0 vulnerabilities. Audit results can change
as new advisories are published. Clean installations may still report deprecation
warnings from transitive dependencies; these are distinct from audit findings.

## Swagger

Open: `http://localhost:3000/docs`

## Endpoints

### Authentication

All authentication endpoints return a JWT token and user information upon successful login/registration.

#### `POST /auth/register`
Register a new local user.
Request:
```json
{ "name": "Juan Perez", "email": "juan@example.com", "password": "secret123" }
```

#### `POST /auth/login`
Log in a local user.
Request:
```json
{ "email": "juan@example.com", "password": "secret123" }
```

#### `POST /auth/google`
Log in or register a user via Google Identity Services.
Request:
```json
{ "credential": "<GOOGLE_ID_TOKEN>" }
```

#### Response (all auth endpoints)
```json
{ "token": "<jwt>", "user": { "userId": "...", "email": "...", "role": "user" } }
```

### Users (Protected - Requires JWT)

All endpoints in this section require a valid JWT in the `Authorization: Bearer <token>` header. Admin-specific endpoints also require the user to have the `ADMIN` role.

#### `GET /users` (Admin Only)
List all users.
Response: `User[]`

#### `GET /users/:id`
Get details of a specific user.
Access: Self or Admin.
Response: `User`

#### `PATCH /users/:id`
Update user profile.
Access: Self or Admin.
Note: non-admin users cannot change `role`.
Request: `Partial<UpdateUserDto>`
Response: `User`

#### `PATCH /users/:id/role` (Admin Only)
Change a user's role.
Request:
```json
{ "role": "admin" }
```
Response: `User`

#### `DELETE /users/:id`
Delete a user.
Access: Self or Admin.
Response: `User`

### Barbers (Protected - Requires JWT)

All endpoints in this section require a valid JWT in the `Authorization: Bearer <token>` header. Admin-specific endpoints also require the user to have the `ADMIN` role.

#### `POST /barbers` (Admin Only)
Create a new barber.
Request:
```json
{
  "name": "Bob The Barber",
  "email": "bob@barbershop.com",
  "phone": "+1234567890",
  "isActive": true
}
```
Response: `Barber`

#### `GET /barbers`
List all barbers.
Response: `Barber[]`

#### `GET /barbers/:id`
Get details of a specific barber.
Response: `Barber`

#### `PATCH /barbers/:id` (Admin Only)
Update barber information.
Request: `Partial<UpdateBarberDto>`
Response: `Barber`

#### `DELETE /barbers/:id` (Admin Only)
Delete a barber.
Response: `Barber`

### Barber Schedules (Protected - Requires JWT)

All endpoints in this section require a valid JWT in the `Authorization: Bearer <token>` header. Admin-specific endpoints also require the user to have the `ADMIN` role.

#### `POST /barber-schedules` (Admin Only)
Create a new schedule entry for a barber on a specific date.
Request: `CreateBarberScheduleDto`
Response: `BarberSchedule`

#### `GET /barber-schedules`
List all barber schedules.
Response: `BarberSchedule[]`

#### `GET /barber-schedules/:id`
Get details of a specific barber schedule entry by ID.
Response: `BarberSchedule`

#### `GET /barber-schedules/barber/:barberId/date/:date`
Get a barber's schedule for a specific date.
Response: `BarberSchedule`

#### `PATCH /barber-schedules/:id` (Admin Only)
Update a barber schedule entry.
Request: `Partial<UpdateBarberScheduleDto>`
Response: `BarberSchedule`

#### `DELETE /barber-schedules/:id` (Admin Only)
Delete a barber schedule entry.
Response: `BarberSchedule`

### Appointments (Protected - Requires JWT)

All endpoints in this section require a valid JWT in the `Authorization: Bearer <token>` header. Admin-specific endpoints also require the user to have the `ADMIN` role.

#### `POST /appointments`
Create a new appointment.
Request:
```json
{
  "date": "2023-11-15",
  "timeSlot": "10:00",
  "barberId": "60d0fe4f5e367c001f1a2b3d"
}
```
Response: `Appointment`

#### `GET /appointments` (Admin Only)
List all appointments (full agenda).
Response: `Appointment[]`

#### `GET /appointments/availability`
Consult available time slots for a barber on a specific date.
Query Parameters: `barberId`, `date` (YYYY-MM-DD)
Response:
```json
{
  "date": "YYYY-MM-DD",
  "barberId": "...",
  "availableSlots": ["HH:MM", "HH:MM", ...]
}
```

#### `GET /appointments/:id`
Get details of a specific appointment.
Access: Appointment owner or Admin.
Response: `Appointment`

#### `PATCH /appointments/:id` (Admin Only)
Update or cancel an appointment.
Request: `Partial<UpdateAppointmentDto>`
Response: `Appointment`

Changing a current appointment to `cancelled` releases its block and notifies
the client by email. Expired appointments do not trigger email.

#### `DELETE /appointments/:id` (Admin Only)
Delete an appointment.
Response: `Appointment`

### Client booking access and confirmation notifications

- `GET /clients` is restricted to administrators and lists clients (`role=user`) with their access history.
- `PATCH /clients/:id/booking-access` accepts `{ "blocked": true, "reason": "Motivo interno" }`. To unblock, send `blocked: false` with a reason. Reasons are trimmed, required, and limited to 500 characters.
- Each change atomically records the administrator ID, name, date, action, and reason. Repeating a stale change returns 409 rather than appending duplicate history. Administrators and barbers cannot be blocked through this endpoint.
- `isBookingBlocked` defaults to false for existing users. Internal reasons and access history are excluded from ordinary user queries (`select: false`). No data migration is required.
- Blocked clients receive 403 with code `CLIENT_BOOKING_BLOCKED` when creating a reservation, including through existing sessions. Existing reservations remain available for viewing and cancellation under the existing rules. Blocking sends no email.
- A `pending` → `confirmed` transition sends the client a confirmation email with barber, date, time, and confirmed status. The database update checks that the reservation is still pending so concurrent confirmations cannot both trigger the email. Saving an already confirmed reservation does not resend it.
- Delivery uses the existing email service. Failures are logged without reverting the confirmed reservation; no retry queue is implemented.
- Client access HTTP tests use mocked services and no database or email: `npx jest --config ./test/jest-e2e.json --runInBand client-access`.

### Reservation state transitions

- Pending reservations can be confirmed or cancelled.
- Confirmed reservations can be cancelled, or completed by administration from their start time onward (America/Santiago). Past confirmed reservations can therefore be closed manually.
- Cancelled and completed reservations are final and cannot be edited or reactivated. There is no automatic completion.
- Updates check the previously read state atomically. If another request changed it, the API returns 409 instead of overwriting the new state.
- Completion keeps the occupied slot and removes the active-client key; cancellation releases the slot. Final records can be archived without physical deletion.
