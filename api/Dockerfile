FROM oven/bun:1
ENV NODE_ENV=production
# SENTRY_DSN is intentionally not baked into the image. Provide it at build
# time (--build-arg SENTRY_DSN=...) or, preferably, at runtime via the
# compose `environment` passthrough. The API runs fine without it
# (Sentry.init is skipped when SENTRY_DSN is unset).
ARG SENTRY_DSN=""
ENV SENTRY_DSN=${SENTRY_DSN}
LABEL org.opencontainers.image.source=https://github.com/tdjsnelling/sqtracker
WORKDIR /sqtracker
COPY package.json bun.lock ./
COPY api/package.json ./api/package.json
COPY client/package.json ./client/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY plugins/reseed-radar/package.json ./plugins/reseed-radar/package.json
RUN bun install --frozen-lockfile --production
COPY . .
WORKDIR /sqtracker/api
EXPOSE 3001
CMD ["bun", "src/index.js"]
