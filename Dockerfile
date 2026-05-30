FROM oven/bun:1-alpine AS base

# where to install dependencies for caching
ARG BUN_INSTALL_DIR=/temp/install
# where the app will live in the final image
ARG BUN_APP_DIR=/usr/src/app

RUN apk add --no-cache ca-certificates

FROM base AS install
WORKDIR ${BUN_INSTALL_DIR}
COPY package.json bun.lock ./
# --production excludes devDependencies
RUN bun install --frozen-lockfile --production

FROM base AS release
# copy production dependencies and source code into final image

EXPOSE 5010/tcp
WORKDIR ${BUN_APP_DIR}
ENV NODE_ENV=production
ARG GIT_HASH
ENV PUBLIC_GIT_HASH=${GIT_HASH}
ENV PUBLIC_DEMO_MODE=false

COPY --from=install ${BUN_INSTALL_DIR}/node_modules node_modules
COPY package.json bunfig.toml ./
COPY bun-plugins ./bun-plugins
COPY src ./src

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "process.exit((await fetch('http://localhost:5010/health')).ok ? 0 : 1)"

CMD ["bun", "run", "src/index.tsx"]
