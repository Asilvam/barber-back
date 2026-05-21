## Barber Back API

NestJS backend with local and Google auth, JWT, MongoDB, and Swagger docs.

## Features

- Local auth (register/login)
- Google Identity Services login
- JWT authentication
- Role-Based Access Control (RBAC) for Admin operations
- MongoDB (Mongoose) with schemas for Users, Barbers, Appointments, and **Barber Schedules**
- CRUD operations for Users, Barbers, Appointments, and **Barber Schedules**
- Appointment scheduling logic (available slots, conflict detection)
- Swagger docs

## Requirements

- Node 22 (`.nvmrc`)
- MongoDB

## Setup

```bash
npm install
```

Create a `.env` in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/barber
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_id
JWT_SECRET=change_me
JWT_EXPIRES_IN=1d
CORS_ORIGIN=*
```

## Run

```bash
npm run start:dev
```

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
Response: `User`

#### `PATCH /users/:id`
Update user profile.
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
}
```

#### `GET /appointments/:id`
Get details of a specific appointment.
Response: `Appointment`

#### `PATCH /appointments/:id` (Admin Only)
Update or cancel an appointment.
Request: `Partial<UpdateAppointmentDto>`
Response: `Appointment`

#### `DELETE /appointments/:id` (Admin Only)
Delete an appointment.
Response: `Appointment`
