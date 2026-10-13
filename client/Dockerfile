FROM oven/bun:1.4.2
ENV NODE_ENV=production
WORKDIR /sqtracker/client
COPY package.json bun.lock ./
COPY client/package.json ./package.json
COPY packages/plugin-sdk/package.json ../packages/plugin-sdk/package.json
RUN bun install --frozen-lockfile --production
COPY client ./
COPY packages/plugin-sdk ../packages/plugin-sdk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD bun -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER bun
CMD ["bun", "--bun", "next", "start"]
