# Signal

Minimal Node + Express app.

## Getting started

1. Copy environment template and point `DATABASE_URL` at your Postgres instance:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate the Prisma client and push the schema (creates table `Ping`):
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. Run the server:
   ```bash
   npm start
   ```
5. Health check (includes DB connectivity): http://localhost:3000/health

### Environment

- `DATABASE_URL`: Postgres connection string
- `JWT_SECRET`: strong secret for JWT signing
- `CORS_ORIGINS`: comma-separated origins allowed by CORS (use `*` in dev)
- `PORT`: optional server port (defaults to 3000)

Set `JWT_SECRET` in your `.env` before using auth.

## API

- `GET /pings?limit=50&offset=0` — list pings (default limit 50, max 100)
- `GET /pings/:id` — fetch a single ping
- `POST /pings` — create a ping; body: `{ "message": "optional string" }`
- `PUT /pings/:id` — update a ping message; body: `{ "message": "optional string" }`
- `DELETE /pings/:id` — delete a ping
   - Requires admin role

Auth (JWT):

- `POST /auth/register` body: `{ "email": "you@example.com", "password": "secret" }` → returns `{ token }`
- `POST /auth/login` body: `{ "email": "you@example.com", "password": "secret" }` → returns `{ token }`

All `/pings` routes require `Authorization: Bearer <token>`.
Admin-only actions require a token containing `role: "ADMIN"`.

### Logging

- Uses `pino` with pretty output in development and JSON in production.
- Each request includes a `x-request-id`; send your own via header to correlate.

Example create:

```bash
curl -X POST http://localhost:3000/pings \
   -H "Content-Type: application/json" \
   -d '{"message":"hello"}'
```
