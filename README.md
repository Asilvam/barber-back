## Barber Back API

NestJS backend with local and Google auth, JWT, MongoDB, and Swagger docs.

## Features

- Local auth (register/login)
- Google Identity Services login
- JWT authentication
- MongoDB (Mongoose)
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
GOOGLE_CLIENT_SECRET=your_google_client_secret
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

### POST /auth/register

Request:
```json
{ "name": "Juan Perez", "email": "juan@example.com", "password": "secret123" }
```

### POST /auth/login

Request:
```json
{ "email": "juan@example.com", "password": "secret123" }
```

### POST /auth/google

Request:
```json
{ "credential": "<GOOGLE_ID_TOKEN>" }
```

### Response (all auth endpoints)

```json
{ "token": "<jwt>", "user": { "id": "...", "email": "..." } }
```
