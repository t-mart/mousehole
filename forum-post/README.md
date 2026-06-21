# Forum Post Documents

For better DX, we author our forum posts here in Markdown.

To convert them into HTML and post them in a MAM post, do the following.

1. Write the post in Markdown in [`forum-post/src/`](./src/). See an example in
   [`forum-post/src/demo.md`](./src/demo.md).
1. Run `bun run forum:build` to convert the Markdown into HTML. The output is
   written to `forum-post/dist`.

   Use `forum:watch` during editing to automatically rebuild on changes. The
   script, the stylesheet ([`forum-post.css`](./forum-post.css)), and the
   documents are all watched for changes.

1. Copy the contents of a generated HTML document to the clipboard.
1. On a MAM forum post editor, find the "View" menu and select "Source code".
1. Replace all content with the clipboard contents, preview, and submit.

## Styling

Posts are styled by [`forum-post.css`](./forum-post.css), which
[`gen-html.ts`](./gen-html.ts) inlines onto every element (forum software strips
`<style>` blocks and classes). Structural elements are styled by tag; code and
the custom directive constructs (callouts, `:::center`) are styled by the
`data-md` attribute the build stamps onto them.
