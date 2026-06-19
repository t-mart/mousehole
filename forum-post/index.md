:::center

  <h1 style="
    margin-bottom: 1.5rem;
    font-size: 38px;
    font-family: ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
    ">
    Mousehole
    <span style="display: block; font-size: 24px; margin-top: 0.5rem;">A Seedbox IP Updater for MAM</span>
  </h1>
  
:::

A background service to update a seedbox IP for MaM and an HTTP server to manage
it.

![Mousehole Demo](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/demo.webp?cache=2)

This can be helpful if you are using a VPN/seedbox to seed and your IP address
is not stable.

:::center

## Features

:::

- Background service that regularly updates MAM with the IP address of the host.
  Set it and forget it!
- Convenient frontend website that can set your MAM cookie, show status, and let
  you trigger updates manually.
- API server with management endpoints. See
  [API.md](https://github.com/t-mart/mousehole/blob/master/docs/API.md) for
  details.

:::center

## Setup

:::

1. Bring up a Docker Compose stack with a `compose.yml` like this:

   ```yaml
   services:
     mousehole:
       image: tmmrtn/mousehole:latest
       ports:
         - "5010:5010"
       environment:
         MOUSEHOLE_AUTH_PASSWORD: <random-password>
       volumes:
         - mousehole:/var/lib/mousehole

   volumes:
     mousehole:
   ```

   :::important

   Most users will need more configuration than this, especially if you want to
   use a VPN! The
   [GitHub Readme](https://github.com/t-mart/mousehole?tab=readme-ov-file#docker-compose-recommended)
   has better examples.

   :::

2. Access the web interface at [http://localhost:5010](http://localhost:5010)
   and set your MAM cookie.
3. Get on with your life and let Mousehole keep your seedbox IP updated!

:::center

## Links

:::

- [GitHub Repository](https://github.com/t-mart/mousehole)
- [Support the Project](https://github.com/t-mart/mousehole#support-the-project)
