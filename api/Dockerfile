FROM oven/bun:1.4.2
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
COPY packages/plugin-collages/package.json ./packages/plugin-collages/package.json
COPY packages/plugin-member-ranks/package.json ./packages/plugin-member-ranks/package.json
COPY packages/plugin-reseed-radar/package.json ./packages/plugin-reseed-radar/package.json
COPY packages/plugin-upload-subscriptions/package.json ./packages/plugin-upload-subscriptions/package.json
COPY plugins/collages/package.json ./plugins/collages/package.json
COPY plugins/member-ranks/package.json ./plugins/member-ranks/package.json
COPY plugins/reseed-radar/package.json ./plugins/reseed-radar/package.json
COPY plugins/upload-subscriptions/package.json ./plugins/upload-subscriptions/package.json
COPY vendor ./vendor
RUN bun install --frozen-lockfile --production
COPY . .
WORKDIR /sqtracker/api
EXPOSE 3001
EXPOSE 6969/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD bun -e "fetch('http://localhost:3001/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER bun
CMD ["bun", "src/index.js"]
