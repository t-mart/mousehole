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
- `bun run check:lint` lints with ESLint.
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

### Git hooks

To prevent failing the repo's GitHub Actions CI checks, you can install git
hooks that format the project and run quality checks on it. This project uses
[Husky](https://typicode.github.io/husky/) to manage Git hooks. They are opt-in.
To install them, run:

```bash
bun run hooks
```

If you've installed the hooks and need to bypass them for a particular commit,
pass `-n` (or `--no-verify`) to `git commit`. See Husky's
[skipping Git hooks](https://typicode.github.io/husky/how-to.html#skipping-git-hooks)
for other ways to skip hooks.

### Code health

Optional code-health reports (via `fallow`). These are advisory only and do not
block PRs.

- `bun run fallow:dead-code` finds unreferenced exports and files.
- `bun run fallow:dupes` finds duplicated code.
- `bun run fallow:health` prints an overall health summary.

Again, you can run all three with `bun run --sequential "fallow:*"`.

## Demo fixtures

`bun demo <fixture>` runs the real production app against a mocked MAM so you
can hand-drive a browser through a specific scenario. This is useful for
recording demos and capturing screenshots. Each fixture in
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

## Release Process

1. Ensure the [changelog](/CHANGELOG.md) is up to date and stamped with the new
   version. Link to the release using the URL format, even if the URL does not
   yet exist.
1. Run quality checks with `bun run --sequential "check:*"`, and ensure all
   tests pass.
1. Create a release announcement forum post markdown document in
   [`forum-post/`](/forum-post/) and build it with `bun run forum:build` or
   `bun run forum:watch`. This forum post should be even higher-level than the
   changelog. It should link to the changelog for more details.
1. Make a commit where you update the `version` property in `package.json` to
   the new version, and push it to GitHub. This will trigger the CI workflows to
   build and publish the release.
1. Post the release announcement in the MAM forum.

There may come a point in time where the current version of the project and that
depicted in the images in the documentation have diverged far enough. If that
happens, update them.

## Changelog

The changelog lists changes to the project in a user-facing way (moreso than the
commit history). [Keep a changelog](https://keepachangelog.com/en/1.1.0/) is
used as a guide.

```md
## [Unreleased]

### Added/Changed/Removed/Deprecated/Fixed/Security

- Item 1 was fixed in [#123](link-to-PR-or-issue)
- Item 2 was added in [#abc123](link-to-GH-commit-hash)
- **Breaking**: Item 3 was changed in a way that is not backward-compatible, in
  [#456](link-to-PR-or-issue)

## [vX.Y.Z](link-to-release) - YYYY-MM-DD

...
```

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
