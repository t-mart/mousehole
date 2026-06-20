#!/usr/bin/env bun
/**
 * forum-post/gen-html.ts
 *
 * Transpiles forum-post/*.md into self-contained, inline-styled HTML fragments
 * in forum-post/dist/. Forum software strips <style> blocks and class
 * attributes, so every style is stamped directly onto the element.
 *
 * Conventions beyond plain CommonMark (all remark-directive containers):
 *   - Callouts:    :::note / :::tip / :::important / :::warning / :::caution
 *                  (optional heading: `:::important[Heads up]`)
 *   - Centering:   :::center  ...  :::
 *   - Escape hatch: drop literal inline HTML anywhere; an element that already
 *                   carries a `style=""` is left untouched.
 *
 * Usage:
 *   bun forum-post/gen-html.ts          # build once
 *   bun forum-post/gen-html.ts --watch  # rebuild on change
 */

import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";

import matter from "gray-matter";
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
// Style tokens
// ---------------------------------------------------------------------------

// Unquoted multi-word names (Segoe UI, Liberation Mono) are valid CSS and keep
// the serializer from escaping quotes to &#x27; inside the style attribute.
const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace";

// Dark code surface (lifted from the evergreen forum post). Because it sets its
// own background, pinning a text colour on top of it is safe on any site theme.
const CODE_BG = "oklch(21.6% 0.006 56.043)";
const CODE_FG = "oklch(97% 0.001 106.424)";
const CODE_BORDER = "oklch(92.4% 0.12 95.746)";

const LINK_ACCENT = "oklch(87.9% 0.169 91.605)";

// Borders/rules must read on any site theme, so derive them from the inherited
// text colour rather than assuming one.
const hairline = (pct: number) =>
  `color-mix(in srgb, currentColor ${pct}%, transparent)`;

// Callout accent colours, keyed by directive name (caller-supplied).
const CALLOUT_COLORS: Record<string, string> = {
  note: "#1f6feb",
  tip: "#238636",
  important: "#8957e5",
  warning: "#9e6a03",
  caution: "#da3633",
};

const ARTICLE_STYLE =
  `max-width: 60ch; margin-inline: auto; padding: 1.5rem;` +
  ` font-family: ${FONT_SANS}; font-size: 1.4rem; line-height: 1.6;`;

// Per-tag inline styles. Notably absent: <strong>/<em> (browser defaults are
// correct). Apart from links and code, no tag sets a text colour unless it also
// sets a background, so the host theme shows through.
const STYLES: Record<string, string> = {
  a: `color: ${LINK_ACCENT}; font-size: inherit;`,
  h1: `margin-block: 1.5em 0; font-size: 2em; font-weight: 700; line-height: 1.2;`,
  h2:
    `margin-block: 1.6em 0; padding-block-end: 0.3em; font-size: 1.75em;` +
    ` font-weight: 700; line-height: 1.25; border-block-end: 1px solid ${hairline(20)};`,
  h3: `margin-block: 1.4em 0; font-size: 1.5em; font-weight: 700; line-height: 1.3;`,
  h4: `margin-block: 1.3em 0; font-size: 1.25em; font-weight: 700;`,
  h5: `margin-block: 1.2em 0; font-size: 1em; font-weight: 700;`,
  h6: `margin-block: 1.2em 0; font-size: 0.875em; font-weight: 700; opacity: 0.8;`,
  // `font-size: inherit` makes text track the <article> base size instead of
  // the host stylesheet's per-tag rules (inline styles beat its selectors).
  p: `margin-block: 1em 0; font-size: inherit;`,
  ul: `margin-block: 1em 0; padding-inline-start: 1.5em;`,
  ol: `margin-block: 1em 0; padding-inline-start: 1.5em;`,
  li: `margin-block: 0.25em 0; font-size: inherit;`,
  // No background (kill any the host sets); lean on a left rule and mute the
  // text by fading its own (unknown) colour toward the background.
  blockquote:
    `margin: 1em 0 0; padding-inline-start: 1em; background: transparent;` +
    ` border-inline-start: 0.25rem solid currentColor; font-size: inherit;` +
    ` color: color-mix(in srgb, currentColor 60%, transparent);`,
  img: `display: block; max-width: 100%; height: auto; margin-block: 1em 0; border-radius: 0.5rem;`,
  hr: `margin-block: 2em 0; border: none; border-block-start: 1px solid ${hairline(20)};`,
  // Fills the article width; long lines scroll horizontally. (Inline vs. block
  // <code> is handled in the visitor, which needs the parent for context.)
  pre:
    `margin-block: 1em 0; padding: 1rem; overflow-x: auto;` +
    ` background-color: ${CODE_BG}; color: ${CODE_FG};` +
    ` border: 1px solid ${CODE_BORDER}; border-radius: 0.5rem;` +
    ` font-family: ${FONT_MONO}; font-size: 0.9em; line-height: 1.5;`,
  table: `margin-block: 1em 0; border-collapse: collapse; width: 100%;`,
  th: `padding: 0.4em 0.7em; border: 1px solid ${hairline(20)}; font-weight: 600; text-align: start; font-size: inherit;`,
  td: `padding: 0.4em 0.7em; border: 1px solid ${hairline(20)}; font-size: inherit;`,
};

const calloutContainerStyle = (color: string) =>
  `margin: 1em 0 0; padding: 0.5em 0.8em;` +
  ` border-inline-start: 0.25rem solid ${color}; background: ${color}14;`;

const calloutTitleStyle = (color: string) =>
  `margin: 0; font-weight: 700; font-size: inherit; color: ${color};`;

const INLINE_CODE_STYLE =
  `padding: 0.15em 0.4em; background-color: ${CODE_BG}; color: ${CODE_FG};` +
  ` border-radius: 0.3em; font-family: ${FONT_MONO}; font-size: 0.9em;`;

// Inside <pre>, strip any styling the host puts on <code> so only the block
// surface shows (no boxed-token look) and it inherits the block's colour/font.
const PRE_CODE_STYLE =
  `background-color: transparent; padding: 0; color: inherit;` +
  ` font-family: inherit; font-size: inherit;`;

// A list nested in a list item shouldn't open with a full paragraph-sized gap.
const NESTED_LIST_STYLE = `margin-block: 0.25em 0; padding-inline-start: 1.5em;`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styleOf = (node: Element): string =>
  typeof node.properties?.style === "string" ? node.properties.style : "";

/** Append a declaration, leaving any author-supplied style in place to win. */
const appendStyle = (node: Element, decl: string): void => {
  const existing = styleOf(node).trim();
  const separator =
    existing && !existing.endsWith(";") ? "; " : existing ? " " : "";
  node.properties = {
    ...node.properties,
    style: `${existing}${separator}${decl}`,
  };
};

/** Attach mdast->hast hints without depending on the Data type augmentation. */
const setHast = (
  node: { data?: unknown },
  hName: string | undefined,
  style: string,
): void => {
  const data = (node.data ?? {}) as {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  if (hName) data.hName = hName;
  data.hProperties = { ...data.hProperties, style };
  node.data = data;
};

// ---------------------------------------------------------------------------
// remark plugins (operate on the markdown AST)
// ---------------------------------------------------------------------------

// A container directive node, typed just enough to decorate it. (The full
// type lives in mdast-util-directive, a transitive dependency.)
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
 * `:::note`-family callouts); revert every other directive to its literal text.
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
    setHast(directive, "div", "text-align: center;");
    return;
  }

  const color =
    isContainer && directive.name ? CALLOUT_COLORS[directive.name] : undefined;
  if (color) {
    const children = directive.children ?? [];
    const labelled = children[0]?.data?.directiveLabel
      ? children[0]
      : undefined;
    if (labelled) {
      // `:::note[My title]` -> style the supplied label as the heading.
      setHast(labelled, undefined, calloutTitleStyle(color));
    } else {
      // Bare `:::note` -> synthesise a heading from the directive name.
      const title = {
        type: "paragraph",
        children: [{ type: "text", value: capitalize(directive.name!) }],
      } as unknown as DirectiveChild;
      setHast(title, undefined, calloutTitleStyle(color));
      children.unshift(title);
    }
    directive.children = children;
    setHast(directive, "div", calloutContainerStyle(color));
    return;
  }

  // Unsupported: collapse the node back into the plain text it was written as
  // (`:5010` stays `:5010`), instead of an empty <div>.
  const reverted = directive as unknown as { type: string; value: string };
  reverted.type = "text";
  reverted.value = `${marker}${directive.name ?? ""}`;
};

const transformDirectives = (tree: MdastRoot): void => {
  visit(tree, decorateDirective);
};

const remarkDirectives: Plugin<[], MdastRoot> = () => transformDirectives;

// ---------------------------------------------------------------------------
// rehype plugin (operates on the HTML AST)
// ---------------------------------------------------------------------------

/** Wrap everything in <article> and stamp inline styles onto each element. */
const transformInlineStyles = (tree: HastRoot): void => {
  const article: Element = {
    type: "element",
    tagName: "article",
    properties: { style: ARTICLE_STYLE },
    children: tree.children as ElementContent[],
  };
  tree.children = [article];

  visit(tree, "element", (node, _index, parent) => {
    if (node === article) return;
    // An author-supplied style (raw HTML, callouts, :::center) always wins.
    if (styleOf(node)) return;

    const parentTag = parent?.type === "element" ? parent.tagName : undefined;

    if (node.tagName === "code") {
      const style = parentTag === "pre" ? PRE_CODE_STYLE : INLINE_CODE_STYLE;
      node.properties = { ...node.properties, style };
      return;
    }

    // A nested list (parent is <li>) gets a tighter top margin than a top-level one.
    if (
      (node.tagName === "ul" || node.tagName === "ol") &&
      parentTag === "li"
    ) {
      node.properties = { ...node.properties, style: NESTED_LIST_STYLE };
      return;
    }

    const style = STYLES[node.tagName];
    if (style) node.properties = { ...node.properties, style };
  });

  // Zero the leading top margin down the first-child spine so the document
  // doesn't open with a double gap under the <article> padding.
  let edge: Element | undefined = article.children.find(
    (c): c is Element => c.type === "element",
  );
  while (edge) {
    appendStyle(edge, "margin-block-start: 0;");
    edge = edge.children.find((c): c is Element => c.type === "element");
  }
};

const rehypeInlineStyles: Plugin<[], HastRoot> = () => transformInlineStyles;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const processor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkDirectives)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeInlineStyles)
  .use(rehypeStringify);

export const render = async (markdown: string): Promise<string> => {
  const { content } = matter(markdown);
  const file = await processor.process(content);
  return String(file);
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const SRC_DIR = import.meta.dirname;
const OUT_DIR = path.join(SRC_DIR, "dist");

const buildFile = async (name: string): Promise<string> => {
  const markdown = await readFile(path.join(SRC_DIR, name), "utf8");
  const html = await render(markdown);
  const out = path.join(
    OUT_DIR,
    `${path.basename(name, path.extname(name))}.html`,
  );
  await writeFile(out, `${html}\n`);
  return out;
};

const buildAll = async (): Promise<string[]> => {
  await mkdir(OUT_DIR, { recursive: true });
  const entries = await readdir(SRC_DIR);
  const sources = entries.filter(
    (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
  );
  return Promise.all(sources.map(buildFile));
};

// Run the build only when invoked as a script (not when imported by a test).
if (import.meta.main) {
  const built = await buildAll();
  console.log(`Built ${built.length} file(s) -> ${OUT_DIR}`);
  for (const out of built) console.log(`  ${path.basename(out)}`);

  if (process.argv.includes("--watch")) {
    console.log("Watching for changes... (Ctrl-C to stop)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(SRC_DIR, (_event, filename) => {
      if (!filename || !filename.endsWith(".md")) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        buildAll()
          .then(() =>
            console.log(
              `Rebuilt (${filename}) at ${new Date().toLocaleTimeString()}`,
            ),
          )
          .catch((error: unknown) => console.error(error));
      }, 50);
    });
  }
}
