# ─────────────────────────────────────────────────────────────────────────────
#  Home Binger — Docker image
#  Zero npm dependencies, so the build is just "copy files and run".
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine

# ⚙️ EDIT ME — any of these can be overridden in docker-compose.yml
ENV PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# Copy the whole project (see .dockerignore for exclusions)
COPY package.json ./
COPY server ./server
COPY public ./public
COPY docs ./docs
COPY README.md LICENSE ./

# Where users, sessions, settings and the poster cache live (mount a volume!)
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 8080

# Run as the unprivileged "node" user that node:alpine ships with
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/server.js"]
