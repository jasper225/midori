FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .