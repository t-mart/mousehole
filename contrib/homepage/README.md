# Mousehole Homepage Integration

Configuration for integrating Mousehole with
[Homepage](https://gethomepage.dev), a modern self-hosted homepage for your
services.

![Homepage Widgets Example](./docs/homepage-widgets.png)

## Features

- Display host network information (IP, ASN, Provider)
- Show latest MAM API response status
- Monitor update timing information
- Fully integrated widgets using Homepage's customapi service type

## Usage

1. Copy the contents of [`services.yaml`](./services.yaml) to your Homepage
   configuration
2. Replace `<mousehole-url>` placeholders with your actual Mousehole instance
   URL
3. Restart Homepage to load the new configuration

## Widget Types

### Host Details

Displays current network information:

- IP Address
- ASN
- Provider

### API Response

Shows the latest MAM API response:

- Success status
- HTTP response code
- Response message

### Timing Info

Monitors update timing:

- Last request time
- Last update time
- Next scheduled update time
