FROM oven/bun:1-alpine AS base

# where dependencies are installed / the web UI is built
ARG BUN_INSTALL_DIR=/temp/install
ARG BUN_BUILD_DIR=/temp/build
# where the app will live in the final image
ARG BUN_APP_DIR=/usr/src/app

RUN apk add --no-cache ca-certificates curl

# Production-only dependencies (the backend's runtime libs). A separate stage so
# release can copy just node_modules — none of the install cache or lockfile
# ends up in the final image's layers.
FROM base AS runtime-deps
WORKDIR ${BUN_INSTALL_DIR}
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Build the web UI with Vite. Installs the full dependency set (toolchain
# included) inline; the deps layers cache independently of source changes
# because they only COPY the manifests.
FROM base AS build-web
WORKDIR ${BUN_BUILD_DIR}
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
ARG GIT_HASH
# inlined into the bundle at build time (see vite.config.ts `define`)
ENV PUBLIC_GIT_HASH=${GIT_HASH}
COPY vite.config.ts ./
COPY src ./src
RUN bun run build

FROM base AS release
# copy runtime dependencies, backend source, and the built web UI

EXPOSE 5010/tcp
WORKDIR ${BUN_APP_DIR}
ENV NODE_ENV=production
ARG GIT_HASH
ENV PUBLIC_GIT_HASH=${GIT_HASH}

COPY --from=runtime-deps ${BUN_INSTALL_DIR}/node_modules node_modules
COPY package.json ./
COPY src ./src
COPY --from=build-web ${BUN_BUILD_DIR}/dist ./dist

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "process.exit((await fetch('http://localhost:5010/health')).ok ? 0 : 1)"

CMD ["bun", "run", "src/index.ts"]
