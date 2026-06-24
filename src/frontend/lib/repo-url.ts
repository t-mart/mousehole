// Links into the project's GitHub repo. `blob/master` is GitHub's file view at
// the default branch.
const repoUrl = "https://github.com/t-mart/mousehole";
const blobUrl = (path: string) => `${repoUrl}/blob/master/${path}`;

export const docsUrl = (file: string) => blobUrl(`docs/${file}`);

export const changelogUrl = blobUrl("CHANGELOG.md");
