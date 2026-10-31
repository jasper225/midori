# midori

midori is a productivity tool that tracks time and scroll distance on social media platforms. It syncs usage to the backend and displays
pause or daily-limit prompts upon spending the designated amount of time.

## Workspace layout

- `extension/` — Manifest V3 browser extension (popup, tracking scripts, and
  background service worker).
- `backend/` — Express API, Prisma schema, and PostgreSQL migrations.
- `frontend/` — Next.js app scaffold.
- `docker-compose.yml` — Local PostgreSQL service.

## Requirements

- Node.js and npm versions supported by the project dependencies.
- Docker with Docker Compose, or an available PostgreSQL database.
- Chrome or another Chromium-based browser to load the extension.
- cURL, Postman, or any API-testing tool for sending POST requests for account registration and tracked domain adding.

## Run locally

### 1. Start PostgreSQL

From the repository root:

```sh
docker compose up -d db
```

The Compose service creates a database named `midori` on port `5432`. Configure
the connection URL to match the credentials in `docker-compose.yml`.

### 2. API startup & configuration

Create `backend/.env` with a PostgreSQL connection string and a private JWT
signing secret:

```dotenv
DATABASE_URL="postgresql://postgres:<database-password>@localhost:5432/midori?schema=public"
JWT_SECRET="<long-random-secret>"
```

Then run:

```sh
cd backend
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

The API listens on `http://localhost:4000`. Check that it is running at
[`http://localhost:4000/health`](http://localhost:4000/health).

### 3. Start the frontend scaffold (optional)

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open [`http://localhost:3000`](http://localhost:3000). This is currently the
unmodified starter page serving as a placeholder for the dashboard later to be implemented.

### 4. Load the browser extension

1. Open `chrome://extensions` in Chrome (or the equivalent extensions page in
   your Chromium browser).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's `extension/` folder.
4. Register an account by sending a `POST` request to `/auth/register`, then
   log in from the midori extension popup.
5. Add tracked domains using the authenticated `POST /sites` API endpoint.

For example, the registration request accepts JSON:

```json
{
  "email": "user@email.com",
  "password": "password"
}
```

To add a site, send `POST /sites` with JSON such as
`{"domain":"example.com","dailyLimitMin":30}`. The daily limit is optional.

The extension connects to `http://localhost:4000`; its manifest grants access
to that local API. It records usage only for domains associated with the signed
in account. The extension prompts periodically and when a site's configured
daily limit is reached.

## API overview

All routes are served from `http://localhost:4000`. Protected endpoints accept
the web login cookie or an `Authorization` header containing the extension's
bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Log in with a cookie |
| `POST` | `/auth/extension-login` | Log in and receive a bearer token |
| `POST` | `/auth/logout` | Clear the login cookie |
| `GET` | `/auth/me` | Get the authenticated user's profile |
| `GET` | `/sites` | List tracked domains |
| `POST` | `/sites` | Add a tracked domain and optional daily limit |
| `PATCH` | `/sites/:id` | Adjust the daily limit of the tracked domain |
| `DELETE` | `/sites/:id` | Remove a tracked domain |
| `POST` | `/sessions` | Start a scroll session |
| `POST` | `/sessions/:id` | End a scroll session |
| `POST` | `/usage` | Record daily time and scroll usage |
| `GET` | `/usage/today?date=YYYY-MM-DD` | Get usage totals for a date |

## Development checks

The frontend provides these scripts:

```sh
cd frontend
npm run lint
npm run build
```

The backend currently provides `npm run dev`; no backend test suite is
configured yet.