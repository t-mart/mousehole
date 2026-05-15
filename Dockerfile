FROM oven/bun:1-debian AS base

# where to install dependencies for caching
ARG BUN_INSTALL_DIR=/temp/install
# where the app will live in the final image
ARG BUN_APP_DIR=/usr/src/app

FROM base AS base-with-curl
# install curl for health checks, at top for caching
RUN apt-get update && \
    apt-get install -y curl --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

FROM base AS install
WORKDIR ${BUN_INSTALL_DIR}
COPY package.json bun.lock ./
# --production excludes devDependencies
RUN bun install --frozen-lockfile --production

FROM base-with-curl AS release
# copy production dependencies and source code into final image

USER bun
EXPOSE 5010/tcp
WORKDIR ${BUN_APP_DIR}
ENV NODE_ENV=production
ARG GIT_HASH
ENV BUN_PUBLIC_GIT_HASH=${GIT_HASH}

COPY --from=install ${BUN_INSTALL_DIR}/node_modules node_modules
COPY package.json bunfig.toml ./
COPY src ./src

CMD ["bun", "run", "src/index.tsx"]
