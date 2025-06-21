FROM oven/bun

WORKDIR /mousehole

COPY package.json .
COPY bun.lock .
COPY bunfig.toml .
COPY src ./src

RUN bun install

CMD ["bun", "run", "start"]
