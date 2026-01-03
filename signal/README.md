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

### Storage (S3)

- To enable S3-backed storage, set `STORAGE_PROVIDER=s3` in your `.env`.
- Required S3-related env vars when using S3:
  - `S3_BUCKET` — the bucket name (e.g., `studioos-7itqmdwxmppezac89pezcawghuubkuse2a-s3alias`)
  - `S3_REGION` — AWS region (e.g., `us-east-1`)
  - `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` — programmatic credentials (or use IAM role/Secrets Manager in production)
  - `S3_ENDPOINT` — optional, for S3-compatible services (e.g., MinIO)
  - `S3_FORCE_PATH_STYLE` — set to `true` for MinIO/path-style addressing

Notes:
- The storage layer uses multipart streaming uploads (via `@aws-sdk/lib-storage`) to avoid buffering large uploads in memory.
- After streaming completes the service attempts to fetch object metadata (HEAD) to determine `sizeBytes`.
- For production, prefer instance roles or Secrets Manager; avoid long-lived credentials in `.env`.

### OpenAI / LLM

- Configure the LLM using environment variables in `.env`:
  - `OPENAI_API_KEY` — API key for OpenAI-compatible endpoint
  - `OPENAI_API_BASE` — API base URL (defaults to `https://api.openai.com`)
  - `OPENAI_MODEL` — model to use. To enable Raptor mini (Preview) for all clients set:
    - `OPENAI_MODEL=raptor-mini-preview`
  - `OPENAI_TIMEOUT` — request timeout in seconds (default 30)

- Keep keys and secrets in a secure store for production environments; set them in your deployment platform or secrets manager rather than `.env` where possible.


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
