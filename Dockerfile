FROM oven/bun:debian

WORKDIR /mam-vpn-ip-updater

RUN apt-get update && \
    apt-get install -y curl --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY bun.lock ./
COPY src ./

RUN bun install

CMD ["bun", "run", "src/index.ts"]
