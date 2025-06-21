FROM oven/bun

WORKDIR /mousehole

COPY package.json .
COPY bun.lock .
COPY src ./src

RUN bun install

CMD ["bun", "start"]
