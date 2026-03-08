# JobFill AI

Project skeleton for a full-stack job search platform.

## Tech stack

- Frontend: Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- Backend: FastAPI (Python)
- Database: PostgreSQL with Prisma ORM
- Queue: Redis + BullMQ
- Auth: NextAuth.js v5 + Google OAuth
- File storage: Local filesystem at `/backend/uploads`
- AI: OpenAI GPT-4o (primary), Google Gemini (secondary)

## Folder structure

```text
/frontend
  /app
    /api/auth/[...nextauth]
  /components/ui
  /lib
  /prisma
/backend
  /app
  /uploads
/extension
/scraper
/docker
.env.example
docker-compose.yml
README.md
```

## Ubuntu server setup (Docker)

1. Update packages:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. Install Docker + Compose plugin:
   ```bash
   sudo apt install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   sudo chmod a+r /etc/apt/keyrings/docker.gpg
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
     sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker $USER
   newgrp docker
   ```
3. Clone or copy this project to the server.
4. Create environment file:
   ```bash
   cp .env.example .env
   ```
5. Fill all secrets in `.env`.

## Google OAuth credentials (Google Cloud Console)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project.
3. Go to **APIs & Services -> OAuth consent screen** and configure app info.
4. Go to **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**.
5. Application type: **Web application**.
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google`
7. Copy values into `.env`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

## Set NEXTAUTH_SECRET

Generate and paste into `.env`:

```bash
openssl rand -base64 32
```

## Run locally with Docker Compose

1. Build and start all services:
   ```bash
   docker compose up --build
   ```
2. Open apps:
   - Frontend: `http://localhost:3000`
   - Backend health check: `http://localhost:8000/health`
3. Stop services:
   ```bash
   docker compose down
   ```

## Upload storage persistence

`docker-compose.yml` mounts `/backend/uploads` as the named volume `backend_uploads`, so uploaded files survive container redeploys.

## Notes

- This is a scaffold only. Feature code is intentionally not implemented yet.
- Prisma schema in `/frontend/prisma/schema.prisma` includes baseline NextAuth models.
