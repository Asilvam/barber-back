# Flujo de Uso de la API: Creación de Usuario, Barbero, Horario y Cita

Aquí tienes un flujo de uso paso a paso para interactuar con tu API, desde la creación de un usuario hasta la reserva de una cita, incluyendo la gestión de barberos y sus horarios.

**Consideraciones Importantes:**

*   **Tokens JWT:** Para los endpoints protegidos, necesitarás incluir un token JWT válido en el encabezado `Authorization: Bearer <tu_token_jwt>`.
*   **Roles:** Algunos endpoints requieren el rol `ADMIN`. Asegúrate de usar un token de un usuario con ese rol cuando sea necesario.
*   **IDs:** Los IDs generados en un paso (ej. `barberId`) se usarán en los pasos siguientes.

---

### **Paso 1: Crear un Usuario (Registrarse)**

Este endpoint no requiere autenticación previa. El usuario creado tendrá el rol `user` por defecto.

*   **Endpoint:** `POST /auth/register`
*   **Rol Requerido:** Público
*   **Encabezados:**
    ```
    Content-Type: application/json
    ```

*   **Cuerpo de la Solicitud (JSON):**
    ```json
    {
      "name": "Alice Smith",
      "email": "alice@example.com",
      "password": "securepassword123"
    }
    ```

*   **Respuesta Exitosa (JSON):**
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // Guarda este token para futuras solicitudes
      "user": {
        "userId": "60d0fe4f5e367c001f1a2b3c", // Corregido: Ahora es userId
        "email": "alice@example.com",
        "name": "Alice Smith",
        "role": "user"
      }
    }
    ```

    **Guarda el `token` de Alice.**

---

### **Paso 2: Crear un Barbero**

Para crear un barbero, necesitas un token de un usuario con rol `ADMIN`. Si Alice no es admin, deberías usar un token de un usuario administrador existente o promover a Alice a admin (lo cual requeriría otro token de admin para usar el endpoint `PATCH /users/:id/role`).

*   **Endpoint:** `POST /barbers`
*   **Rol Requerido:** `ADMIN`
*   **Encabezados:**
    ```
    Content-Type: application/json
    Authorization: Bearer <TOKEN_ADMIN_JWT>
    ```

*   **Cuerpo de la Solicitud (JSON):**
    ```json
    {
      "name": "Bob The Barber",
      "email": "bob@barbershop.com",
      "phone": "+1234567890",
      "isActive": true
    }
    ```

*   **Respuesta Exitosa (JSON):**
    ```json
    {
      "name": "Bob The Barber",
      "email": "bob@barbershop.com",
      "phone": "+1234567890",
      "isActive": true,
      "role": "barber",
      "_id": "60d0fe4f5e367c001f1a2b3d", // Guarda este ID de barbero
      "createdAt": "2023-10-27T10:00:00.000Z",
      "updatedAt": "2023-10-27T10:00:00.000Z",
      "__v": 0
    }
    ```

    **Guarda el `_id` del barbero (ej. `barberId = "60d0fe4f5e367c001f1a2b3d"`).**

---

### **Paso 3: Crear un Horario para el Barbero**

Ahora, definimos cuándo Bob el Barbero estará disponible.

*   **Endpoint:** `POST /barber-schedules`
*   **Rol Requerido:** `ADMIN`
*   **Encabezados:**
    ```
    Content-Type: application/json
    Authorization: Bearer <TOKEN_ADMIN_JWT>
    ```

*   **Cuerpo de la Solicitud (JSON):**
    ```json
    {
      "barberId": "60d0fe4f5e367c001f1a2b3d", // Usa el ID del barbero de antes
      "date": "2023-11-15", // Una fecha futura
      "isDayOff": false,
      "workingHours": [
        { "start": "09:00", "end": "13:00" },
        { "start": "14:00", "end": "18:00" }
      ],
      "breakTimes": [
        { "start": "13:00", "end": "14:00" }
      ]
    }
    ```

*   **Respuesta Exitosa (JSON):**
    ```json
    {
      "barberId": "60d0fe4f5e367c001f1a2b3d",
      "date": "2023-11-15",
      "isDayOff": false,
      "workingHours": [
        { "start": "09:00", "end": "13:00" },
        { "start": "14:00", "end": "18:00" }
      ],
      "breakTimes": [
        { "start": "13:00", "end": "14:00" }
      ],
      "_id": "60d0fe4f5e367c001f1a2b3e", // ID del horario creado
      "createdAt": "2023-10-27T10:05:00.000Z",
      "updatedAt": "2023-10-27T10:05:00.000Z",
      "__v": 0
    }
    ```

---

### **Paso 4: Consultar Horarios Disponibles**

Antes de reservar, Alice puede querer ver qué horas están disponibles para Bob en una fecha específica.

*   **Endpoint:** `GET /appointments/availability`
*   **Rol Requerido:** Usuario Autenticado (ej. el token de Alice)
*   **Encabezados:**
    ```
    Authorization: Bearer <TOKEN_ALICE_JWT>
    ```

*   **Parámetros de Consulta:**
    *   `barberId`: `60d0fe4f5e367c001f1a2b3d` (ID de Bob)
    *   `date`: `2023-11-15`

*   **URL Completa (ejemplo):** `GET /appointments/availability?barberId=60d0fe4f5e367c001f1a2b3d&date=2023-11-15`
*   **Respuesta Exitosa (JSON):**
    ```json
    {
      "date": "2023-11-15",
      "barberId": "60d0fe4f5e367c001f1a2b3d",
      "availableSlots": ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
    }
    ```

---

### **Paso 5: Reservar una Cita**

Alice ahora puede reservar una de las horas disponibles.

*   **Endpoint:** `POST /appointments`
*   **Rol Requerido:** Usuario Autenticado (ej. el token de Alice)
*   **Encabezados:**
    ```
    Content-Type: application/json
    Authorization: Bearer <TOKEN_ALICE_JWT>
    ```

*   **Cuerpo de la Solicitud (JSON):**
    ```json
    {
      "date": "2023-11-15",
      "timeSlot": "10:00", // Una hora de los slots disponibles
      "barberId": "60d0fe4f5e367c001f1a2b3d" // ID de Bob
    }
    ```

*   **Respuesta Exitosa (JSON):**
    ```json
    {
      "date": "2023-11-15",
      "timeSlot": "10:00",
      "barberId": "60d0fe4f5e367c001f1a2b3d",
      "status": "pending",
      "_id": "60d0fe4f5e367c001f1a2b3f", // ID de la cita creada
      "createdAt": "2023-10-27T10:10:00.000Z",
      "updatedAt": "2023-10-27T10:10:00.000Z",
      "__v": 0
    }
    ```