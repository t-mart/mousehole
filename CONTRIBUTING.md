# Contributing to Mousehole

Here are some things to keep in mind:

- No contribution is too small! Please submit as many fixes for typos and
  grammar bloopers as you can.
- Beginners are welcome. If you are new to programming, Git,
  JavaScript/TypeScript, or anything related to the project, then I can help
  you. Just ask.
- Don't be afraid to open half-finished PRs, and ask questions if something is
  unclear!
- Pull requests should be made on their own separate branches.
- Try to limit each pull request to _one_ idea only.
- All tests and quality checks must pass on changes. Add new ones for new
  features and bug fixes. See the [development section](#development) below for
  how to run these checks.
- Document changes in the [README](/README.md), documents under [docs/](/docs/),
  and/or the [changelog](/CHANGELOG.md).

## Development

Start development by cloning the repository and running the app development
server:

```bash
cd /path/to/mousehole
bun install
bun dev
```

This runs two processes in parallel: the backend (`bun dev:server`, restarts on
change) and the Vite dev server (`bun dev:web`, hot module reloading). Browse
the app at <http://localhost:5010/web>; the backend reverse-proxies `/web/*` to
Vite in development, so the dev URL matches production. (The vite server will
display its own URL in the terminal, but ignore that.)

### Local environment

When you run the server in development, Bun loads `.env.development` (committed
defaults: a short update interval, a local `./.state` directory, and a dev
password of `password`). To override any of these, create a `.env.local` file
and set your custom values there. This file is ignored by git.

### Quality checks

- `bun run check:fmt` checks formatting with Prettier.
- `bun run check:lint` lints `src` and `tests` with ESLint.
- `bun run check:types` type-checks with `tsc`.
- `bun run check:test` runs the Vitest suite.

Run them all at once with `bun run --sequential "check:*"`.

### Formatting

Formatting is handled by Prettier across every file type it supports.
Configuration lives in [`.prettierrc.json`](/.prettierrc.json), and exclusions
are listed in [`.prettierignore`](/.prettierignore).

- `bun run check:fmt` reports any files that are not formatted (this is the
  check that runs in CI).
- `bun run fmt` rewrites those files in place to fix the formatting.

### Code health

Optional code-health reports (via `fallow`). These are advisory only and do not
block PRs.

- `bun run fallow:dead-code` finds unreferenced exports and files.
- `bun run fallow:dupes` finds duplicated code.
- `bun run fallow:health` prints an overall health summary.

Again, you can run all three with `bun run --sequential "fallow:*"`.

## Demo fixtures

`bun demo <fixture>` runs the real production app against a mocked MAM so you
can hand-drive a browser through a specific scenario without touching the
network or a real account. This is useful for recording demos and capturing
screenshots. Each fixture in
[`demo-fixtures/fixtures.ts`](/demo-fixtures/fixtures.ts) pins how the mocked
MAM responds, an optional seed state, and the auth password.

- `bun demo --list` lists the available fixtures.
- `bun demo <fixture-name>` runs the named fixture.
- `--no-build` reuses the existing `dist/` instead of rebuilding, and `--port`
  changes the port (default 5011).

## Forum posts

The project's MAM forum posts are authored in Markdown under `forum-post/` and
transpiled to self-contained, inline-styled HTML. This lets us version-control
the content of the posts.

- `bun run forum:build` builds every `forum-post/*.md` into `forum-post/dist/`.
- `bun run forum:watch` rebuilds on change of the script itself and the source
  Markdown files.

See [`forum-post/README.md`](/forum-post/README.md) for the full posting
workflow.

Note that there is no automation for posting to the forum; you must copy-paste
the built HTML into the forum's rich text editor.

Images in forum posts may need to be cache-busted with an arbitrary query
parameter.

## Releasing

New versions are tagged, released, and pushed to Docker Hub by bumping the
`version` property in `package.json` and pushing to GitHub. The CI workflows
take care of the rest.

## Changelog

Make sure to have an up-to-date [changelog](/CHANGELOG.md). Use the format
established.

Link to the PR or issue that reported or implemented the change if applicable.

## PR/Commit Checks

With each PR against `master` or each commit on it, the following checks run
automatically.

- Tests and quality checks are run
- Docker images are built and pushed to
  [Docker Hub](https://hub.docker.com/r/tmmrtn/mousehole).
  - Commits on `master` are tagged as `edge`.
  - PRs against `master` are tagged as `pr-<number>`.
  - Releases are tagged with `<major>`, `<major>.<minor>`, and
    `<major>.<minor>.<patch>`.

## Getting Help

- Check existing issues before posting. New features and support should be
  discussed in [Discussions](https://github.com/t-mart/mousehole/discussions),
  not in an issue.
- For organization and freshness, do not comment on closed issues. If you have
  new information about a closed issue, open a new one and link to the old one.
