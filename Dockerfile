FROM node:24.9.0-bookworm-slim AS node

FROM node AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y git
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node AS runner
WORKDIR /app

COPY --from=builder /app .

CMD ["node", "dist/index.js"]
