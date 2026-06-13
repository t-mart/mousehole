# Forum Post Documents

For better DX, we author our forum posts here in Markdown.

To convert them into HTML and post them in a MAM post, do the following.

1. Write the post in Markdown here in this directory. See an example in
   [`forum-post/demo.md`](./demo.md).
1. Run `bun run forum:build` to convert the Markdown into HTML. The output is
   written to `forum-post/dist`.

   Use `forum:watch` during editing to automatically rebuild on changes. Both
   the script and the documents are watched for changes.

1. Copy the contents of a generated HTML document to the clipboard.
1. On a MAM forum post editor, find the "View" menu and select "Source code".
1. Replace all content with the clipboard contents, preview, and submit.
