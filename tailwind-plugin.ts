/**
 * Replaces bun-plugin-tailwind, which lives in an unofficial fork, drags in
 * ~380MB of Bun platform binaries via its peer dep, and has a Docker-specific
 * bug that truncates @utility output. This binds directly to the official
 * @tailwindcss/node and @tailwindcss/oxide packages instead.
 * 
 * From https://github.com/oven-sh/bun/issues/12878#issuecomment-4280279428
 */

import type { BunPlugin } from "bun";

import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import path from "node:path";
import process from "node:process";

const TAILWIND_DIRECTIVE = /@import\s+["']tailwindcss["']|@theme|@apply|@tailwind\b/;

function bunTailwindPlugin(): BunPlugin {
  const minify = process.env.NODE_ENV === "production";

  return {
    name: "bun-tailwind-plugin",
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, async ({ path: filePath }) => {
        const source = await Bun.file(filePath).text();
        if (!TAILWIND_DIRECTIVE.test(source)) return;

        const base = path.dirname(filePath);
        const compiler = await compile(source, {
          from: filePath,
          base,
          shouldRewriteUrls: true,
          onDependency: () => {},
        });

        const rootSources = (() => {
          if (compiler.root === "none") return [];
          if (compiler.root === null) {
            return [{ base: process.cwd(), pattern: "**/*", negated: false }];
          }
          return [{ ...compiler.root, negated: false }];
        })();
        const sources = [...rootSources, ...compiler.sources];

        const candidates = new Scanner({ sources }).scan();
        let css = compiler.build(candidates);
        if (minify) css = optimize(css, { minify: true }).code;

        return { contents: css, loader: "css" };
      });
    },
  };
}

export default bunTailwindPlugin();
