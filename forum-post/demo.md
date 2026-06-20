:::center

# Construct Demo

A kitchen-sink document for `gen-html.ts` :::

This top paragraph proves the leading top-margin is zeroed so the document
doesn't open with an awkward gap. It also shows **bold**, _italic_,
`inline code`, and a [plain link](https://example.com) that inherits the site's
own link colour.

## Headings

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

## Lists

A _tight_ unordered list (no blank lines between items, so no `<p>` wrappers):

- First point
- Second point
- Third point

A _loose_ unordered list (blank lines, so each item gets a `<p>`):

- First point, with room to breathe.

- Second point, likewise.

An ordered list, with a nested list inside:

1. Bring the thing up.
2. Configure the thing:
   - one knob
   - another knob
3. Walk away.

## Code

Inline code derives from the block style: `MOUSEHOLE_UPDATE_INTERVAL_SECONDS`.

A fenced block:

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    ports:
      - "5010:5010"
    environment:
      MOUSEHOLE_AUTH_PASSWORD: <random-password>
```

## Callouts

:::note The default heading comes from the directive name. :::

:::tip You can write multiple paragraphs in a callout.

Like this one. :::

:::important[Read this part] Pass a label in brackets to override the heading.
:::

:::warning Something deserves attention here. :::

:::caution And this is the scariest one. :::

## Quotes and rules

A normal blockquote (no directive marker) keeps the quote styling:

> Not every blockquote is a callout. This one is just a quote.

---

## Image

![Mousehole demo](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/demo.webp?cache=2)

## Escape hatch

When a construct doesn't exist, drop in raw HTML. Anything already carrying a
`style=""` is left exactly as written:

<details style="margin-block: 1em 0;">
  <summary style="cursor: pointer; font-weight: 700;">Click to expand</summary>
  <p style="margin-block: 0.5em 0;">Markdown has no &lt;details&gt; element, so we reach for HTML.</p>
</details>

A raw table (its cells get the default table styling, since they carry no inline
<code>style</code> of their own):

<table>
  <thead>
    <tr><th>Endpoint</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td>PUT /cookie</td><td>Change your cookie value</td></tr>
    <tr><td>POST /updates</td><td>Trigger an update</td></tr>
    <tr><td>GET /state</td><td>Read the current state</td></tr>
  </tbody>
</table>
