#!/usr/bin/env bun
/**
 * forum-post/gen-html.ts
 *
 * Transpiles forum-post/src/*.md into self-contained, inline-styled HTML
 * fragments in forum-post/dist/. Forum software strips <style> blocks and class
 * attributes, so styling is inlined directly onto each element.
 *
 * Pipeline: remark/rehype produce plain semantic HTML, annotated with data-md
 * attributes that name the markdown construct each element came from (e.g.
 * data-md="code-inline" vs data-md="code-block", data-md="callout"). The rules
 * in forum-post.css target those (structural elements by tag; code and the
 * custom directive constructs by data-md), and juice inlines everything onto
 * the style attribute.
 *
 * An author-supplied style="" on raw inline HTML keeps its own declarations;
 * juice merges in any non-conflicting defaults from a matching rule on top.
 *
 * Conventions beyond plain CommonMark (all remark-directive containers):
 *   - Callouts:    :::note / :::tip / :::important / :::warning / :::caution
 *                  (optional heading: `:::important[Heads up]`)
 *   - Centering:   :::center  ...  :::
 *   - Escape hatch: drop literal inline HTML anywhere.
 *
 * Usage:
 *   bun forum-post/gen-html.ts          # build once
 *   bun forum-post/gen-html.ts --watch  # rebuild on change
 */

import type { Root as MdastRoot } from "mdast";

import matter from "gray-matter";
import juice from "juice";
import { watch } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Attach mdast->hast hints without depending on the Data type augmentation. */
const setHast = (
  node: { data?: unknown },
  hName: string | undefined,
  properties: Record<string, unknown>,
): void => {
  const data = (node.data ?? {}) as {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  if (hName) data.hName = hName;
  data.hProperties = { ...data.hProperties, ...properties };
  node.data = data;
};

// ---------------------------------------------------------------------------
// remark plugin (operates on the markdown AST)
// ---------------------------------------------------------------------------

// The callout directives we define; every other `:::name` reverts to text.
const CALLOUT_NAMES = new Set([
  "note",
  "tip",
  "important",
  "warning",
  "caution",
]);

// A container directive node, typed just enough to decorate it. (The full type
// lives in mdast-util-directive, a transitive dependency.)
interface DirectiveChild {
  type: string;
  data?: Record<string, unknown>;
}
interface DirectiveNode {
  type: string;
  name?: string;
  children?: DirectiveChild[];
  data?: unknown;
}

// Markers by directive type, used to rebuild the literal source of directives
// we don't define.
const DIRECTIVE_MARKERS: Record<string, string> = {
  textDirective: ":",
  leafDirective: "::",
  containerDirective: ":::",
};

/**
 * Decorate the container directives we define (`:::center` and the
 * `:::note`-family callouts) with data-md attributes; revert every other
 * directive to its literal text.
 *
 * remark-directive v4 treats any `:name` as a directive, so a stray colon in
 * prose (localhost:5010, 5:30) parses as a textDirective and, left alone,
 * renders as an empty element with its text dropped. The maintainer's
 * recommended fix is this if/else: handle known names, turn the rest back into
 * words. See https://github.com/remarkjs/remark-directive/issues/19.
 */
const decorateDirective = (node: unknown): void => {
  const directive = node as DirectiveNode;
  const marker = DIRECTIVE_MARKERS[directive.type];
  if (!marker) return; // not a directive at all

  const isContainer = directive.type === "containerDirective";

  if (isContainer && directive.name === "center") {
    setHast(directive, "div", { "data-md": "center" });
    return;
  }

  if (isContainer && directive.name && CALLOUT_NAMES.has(directive.name)) {
    const children = directive.children ?? [];
    const labelled = children[0]?.data?.directiveLabel ? children[0] : undefined;
    if (labelled) {
      // `:::note[My title]` -> mark the supplied label as the heading.
      setHast(labelled, undefined, { "data-md": "callout-title" });
    } else {
      // Bare `:::note` -> synthesise a heading from the directive name.
      const title = {
        type: "paragraph",
        children: [{ type: "text", value: capitalize(directive.name) }],
      } as unknown as DirectiveChild;
      setHast(title, undefined, { "data-md": "callout-title" });
      children.unshift(title);
    }
    directive.children = children;
    setHast(directive, "div", {
      "data-md": "callout",
      "data-callout": directive.name,
    });
    return;
  }

  // Unsupported: collapse the node back into the plain text it was written as
  // (`:5010` stays `:5010`), instead of an empty <div>.
  const reverted = directive as unknown as { type: string; value: string };
  reverted.type = "text";
  reverted.value = `${marker}${directive.name ?? ""}`;
};

/** Tag inline vs block code so the stylesheet can target each construct. */
const annotateNode = (node: unknown): void => {
  const typed = node as { type: string };
  if (typed.type === "inlineCode") {
    setHast(node as { data?: unknown }, undefined, { "data-md": "code-inline" });
    return;
  }
  if (typed.type === "code") {
    setHast(node as { data?: unknown }, undefined, { "data-md": "code-block" });
    return;
  }
  decorateDirective(node);
};

const transformMarkdown = (tree: MdastRoot): void => {
  visit(tree, annotateNode);
};

const remarkAnnotate: Plugin<[], MdastRoot> = () => transformMarkdown;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const processor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkAnnotate)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify);

// Output is forum HTML, which wants style attributes, not the legacy
// presentational attributes juice can otherwise derive from CSS.
const JUICE_OPTIONS = {
  applyWidthAttributes: false,
  applyHeightAttributes: false,
  applyAttributesTableElements: false,
};

// juice copies CSS values verbatim, so a value wrapped across lines (e.g. a long
// font stack the formatter broke at 80 columns) would land as a literal newline
// inside a style attribute. Join wrapped lines back up first; CSS is
// whitespace-insensitive between tokens, so this is safe and keeps the inlined
// output on one line per element.
const compactCss = (css: string): string => css.replaceAll(/\s*\n\s*/g, " ");

export const render = async (
  markdown: string,
  css: string,
): Promise<string> => {
  const { content } = matter(markdown);
  const file = await processor.process(content);
  const wrapped = `<article>${String(file)}</article>`;
  return juice.inlineContent(wrapped, compactCss(css), JUICE_OPTIONS);
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const ROOT_DIR = import.meta.dirname;
const SRC_DIR = path.join(ROOT_DIR, "src");
const OUT_DIR = path.join(ROOT_DIR, "dist");
const CSS_FILE = "forum-post.css";
const CSS_PATH = path.join(ROOT_DIR, CSS_FILE);

const buildFile = async (name: string, css: string): Promise<string> => {
  const markdown = await readFile(path.join(SRC_DIR, name), "utf8");
  const html = await render(markdown, css);
  const out = path.join(
    OUT_DIR,
    `${path.basename(name, path.extname(name))}.html`,
  );
  await writeFile(out, `${html}\n`);
  return out;
};

const buildAll = async (): Promise<string[]> => {
  await mkdir(OUT_DIR, { recursive: true });
  const css = await readFile(CSS_PATH, "utf8");
  const entries = await readdir(SRC_DIR);
  const sources = entries.filter((f) => f.endsWith(".md"));
  return Promise.all(sources.map((name) => buildFile(name, css)));
};

// Run the build only when invoked as a script (not when imported by a test).
if (import.meta.main) {
  const built = await buildAll();
  console.log(`Built ${built.length} file(s) -> ${OUT_DIR}`);
  for (const out of built) console.log(`  ${path.basename(out)}`);

  if (process.argv.includes("--watch")) {
    console.log("Watching for changes... (Ctrl-C to stop)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rebuild = (label: string): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        buildAll()
          .then(() =>
            console.log(
              `Rebuilt (${label}) at ${new Date().toLocaleTimeString()}`,
            ),
          )
          .catch((error: unknown) => console.error(error));
      }, 50);
    };
    // The .md and .css files are read at runtime (not imported), so Bun's
    // --watch can't see them; watch them here. Watch the directories rather
    // than the files so atomic-save editors (write + rename) don't break the
    // watch, and filter by name so writes into dist/ don't loop the build.
    watch(SRC_DIR, (_event, filename) => {
      if (filename && filename.endsWith(".md")) rebuild(filename);
    });
    watch(ROOT_DIR, (_event, filename) => {
      if (filename === CSS_FILE) rebuild(CSS_FILE);
    });
  }
}
