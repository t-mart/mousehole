FROM oven/bun:debian

WORKDIR /mousehole

# get curl for healthcheck
RUN apt-get update && \
    apt-get install -y curl --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package.json .
COPY bun.lock .
COPY bunfig.toml .
COPY src ./src

RUN bun install

CMD ["bun", "run", "start"]
