# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1-debian AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release

ARG GIT_HASH
ENV BUN_PUBLIC_GIT_HASH=${GIT_HASH}
ENV NODE_ENV=production

# install curl for healthchecks
RUN apt-get update && \
    apt-get install -y curl --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY --from=install /temp/prod/node_modules node_modules
COPY package.json bunfig.toml ./
COPY src ./src

USER bun
EXPOSE 5010/tcp
CMD ["bun", "run", "src/index.tsx"]
