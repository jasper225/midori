FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
# Prisma 7 reads prisma config at generate time; a dummy URL satisfies env() lookups
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma7.config.ts ./
EXPOSE 4000
CMD ["node", "dist/index.js"]