![sqtrackr textmark?](https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/sqtracker_banner.png)

![Latest stable release](https://badgen.net/github/release/gaxolotl/sqtrackr/stable)
[![License GPLv3](https://badgen.net/badge/license/GPLv3/blue)](./LICENSE)
> continuing the legacy of sqtracker.

sqtrackr is an open-source, self-hosted BitTorrent tracker platform for building private or public tracker communities.

It implements all of the features required to run a private (or public) tracker and does not focus on any one specific type of content. It is suitable for running a tracker site of any kind.

## Features

* Accounts
  * Registration modes (open / closed / invite only)
  * Sending of invites
  * Account management (2FA, password resets etc.)
  * Custom profiles with WebP avatars, bios, locations and websites
  * Bonus points system (purchase invites, upload etc.)
  * Option to browse torrents without logging in (for search engine discovery)
* Torrent management
  * Uploading torrents with rich metadata (title, description, source, mediainfo, category, tags etc.)
  * Automatic movie and TV metadata matching via TMDB, with poster-backed suggestions
  * Natural-language and fuzzy search (e.g. "The Rookie season 6 episode 3")
  * Searching torrents or browsing by category or tags
  * Freeleech options (specific torrents, site-wide)
  * Torrent grouping (e.g. different formats of same movie)
  * Bookmarks
* Upload / download tracking
  * Track how much content each user has uploaded / downloaded
  * Track ratios
  * Track hit'n'runs
  * Limit downloading per user based on ratio, HnRs, or both
  * Award bonus points based on upload
* User interaction
  * Commenting on torrents and announcements
  * Up / down voting torrents
  * Requests system
  * Categorised discussion forums with Markdown posts
  * Private one-to-one and group conversations with unread tracking
* Moderation
  * Staff / admin privileges
  * Optional premoderation queue for user uploads with retained decisions and private-message notifications
  * Reporting torrents to be reviewed by staff
  * Detailed stats available to admins
  * Runtime-safe site settings available to admins without a service restart
  * Configurable content limits for names, titles, bodies, comments, messages, profiles, MediaInfo, tags and the maximum uploaded `.torrent` size
  * Wiki system
  * Announcements / news posts
  * Ban / unban users
* Plugins
  * Trusted, build-time plugin API with routes, storage, settings, events and UI slots
  * Enable, configure and remove installed plugins from **Settings → Plugins**
  * Ships with the Reseed example plugin for reviving torrents that have lost their seeders
* Tracker appearance
  * Configurable theme / CSS

## Roadmap

The roadmap is still being expanded.

* Anti-cheat

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/gaxolotl/sqtrackr.git
cd sqtrackr
```

### 2. Create your configuration

Copy the example configuration:

```bash
cp config.example.js config.js
```

Then edit `config.js` and set the required environment values and secrets.

### 3. Configure your domain

If you are using the included Traefik setup:

* Set your ACME email in `docker-compose.yml`
* Replace `example.com` in `traefik.yml` with your domain

### 4. Start sqtrackr

```bash
docker compose up -d
```

sqtrackr will start the API, web client, MongoDB database, and reverse proxy.

### 5. Log in

On first startup, sqtrackr creates an administrator account:

```text
Username: admin
Password: admin
```

Change the password immediately after logging in.

For the full configuration and deployment guide, see the sections below.

## Configuration

Initial configuration is provided via a single JavaScript file named `config.js`. This file must export an object containing 2 keys: `envs` and `secrets`.

An example configuration can be found in `config.example.js`. This file contains examples and explanations for each config value.

If your configuration is not valid, sqtrackr will fail to start.

After setup, admins can change runtime-safe site, tracker, economy, theme, and avatar settings from `/settings`. These overrides are stored in MongoDB and apply without restarting the API. Infrastructure settings and secrets (database, URLs, ports, SMTP, JWT and server secrets) intentionally remain in `config.js` and require a restart.

### The initial admin user

On first start up, sqtrackr will create a user named `admin` with the password `admin`. A confirmation email will be sent to the admin email address you specified in your config file. Once logged in for the first time, you should change the admin password immediately. This admin user can be used to send other admin invites (normal accounts cannot send admin invites). This user cannot be deleted/banned.

## Plugins

sqtrackr supports **trusted, build-time plugins** that can add API routes, storage, settings, domain-event handlers, navigation, pages and UI slots.

Plugins are installed by adding a workspace package and registering it in the API and client registries, then rebuilding — there is intentionally no runtime code upload or execution. Admins can enable, disable, configure and remove installed plugins from **Settings → Plugins**, and plugin settings get their own generated form in that tab.

The repository ships with the [Reseed](./plugins/reseed-radar) example plugin, which lets members request reseeds for torrents that have lost their seeders, tracks demand, and automatically closes requests when a seeder returns.

See [PLUGINS.md](./PLUGINS.md) for the manifest reference, permissions, lifecycle, server and client APIs, events, UI slots and a step-by-step guide to writing a plugin.

## Deploying

### Components

An sqtrackr deployment is made up of 4 separate components. These are:

#### 1. The sqtrackr API service

The sqtrackr API service handles all actions taken by users (authentication, uploads, searching etc.), implements the BitTorrent tracker specification to handle announces and scrapes, and provides the RSS feed.

#### 2. The sqtrackr client service

The sqtrackr client service provides the modern, responsive web interface that users interact with.

#### 3. A MongoDB database

[MongoDB](https://www.mongodb.com/) is a popular and powerful document-oriented database. Version 5.2 or higher is required.

#### 4. A HTTP proxy server

The HTTP proxy allows the client, API, and BitTorrent tracker to all be accessible via a single endpoint.

Traefik is recommended and is configured by default. An Nginx config file is also provided for those that prefer it and the `docker-compose.yml` file contains an Nginx block that can be enabled.

### Deploying with Docker compose

The sqtrackr platform is designed to be deployed via Docker. Once a configuration file is created, deploying is as simple as running `docker compose up -d` at the root of the project.

To get HTTPS working, you will need to change a few values:

* In `docker-compose.yml`: `--certificatesresolvers.tlsresolver.acme.email=` needs to have a valid email address.
* In `traefik.yml`: 2 instances of `` Host(`example.com`) `` need to contain your domain name.

If you change the name of any services in `docker-compose.yml`, you will also need to update the relevant host names in your `config.js` and `traefik.yml` files.

sqtrackr is reasonably light-weight, but you should still invest in a VPS with decent resources if you want to run a fast and performant tracker.

### Deploying with a PaaS platform

Alternatively, you can deploy each service individually on a PaaS cloud platform such as [Northflank](https://northflank.com).

You will need to deploy each of the 4 components listed above. The Docker images for the client and API services are published in this repository.

## Adding a translation

New translations are always appreciated!

To add a new translation in your own language, create a new JSON file with your 2 character locale code in `client/locales`. For example, `client/locales/en.json`. In the `client/locales/index.js` file, you should then import your JSON file and add it to the exported object along with the existing locales.

The best place to start is to copy the `en.json` file and work through it, translating each English string.

There is also an [inlang project](https://fink.inlang.com/github.com/gaxolotl/sqtrackr) to aid with translation.

### Existing translations

| Language           | Contributed by                                       |
|--------------------|------------------------------------------------------|
| English            |                                                      |
| Russian            | [@smlinux](https://github.com/smlinux)               |
| Esperanto          | [@smlinux](https://github.com/smlinux)               |
| German             | [@EchterAlsFake](https://github.com/EchterAlsFake)   |
| Simplified Chinese | [@0EAC](https://github.com/0EAC)                     |
| French             | [@Klaiment](https://github.com/Klaiment)             |
| Spanish            | [@CerealKillerjs](https://github.com/CerealKillerjs) |
| Italian            | [@NotLugozzi](https://github.com/NotLugozzi)         |
| Bulgarian          | [@gaxolotl](https://github.com/gaxolotl)             |

## Screenshots

### Splash screen
<img width="1663" alt="splash" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20180049.png">

### Home
<img width="1707" alt="home" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175536.png">

### Torrent
<img width="1707" alt="torrent" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20181143.png">

### Upload
<img width="1707" alt="upload" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175613.png">

### Announcements
<img width="1707" alt="categories" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175637.png">

### Profile
<img width="1663" alt="profile" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20180032.png">

### Forum
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175751.png">

### Messages
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175810.png">

### RSS
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175819.png">

### Wiki
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175859.png">

### Reseed (Plugin)
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175918.png">

### Reports
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175954.png">

### Requests
<img width="1663" alt="announcement" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20175728.png">

### Search
<img width="1707" alt="report" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20113239.png">

### Stats
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20180003.png">

### Settings
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20180012.png">
<img width="1663" alt="account" src="https://raw.githubusercontent.com/gaxolotl/gaxolotl/refs/heads/main/Screenshot%202026-09-11%20180021.png">

## Contributing

Pull requests are welcome! If you fork sqtrackr and think you have made some improvements, please open a pull request so other users deploying sqtrackr from this repository can also get the benefits.

Please see the [CONTRIBUTING](./CONTRIBUTING.md) document for development setup, architecture notes, code style and the required checks, and [PLUGINS.md](./PLUGINS.md) when building plugins.

## License

GNU GPLv3
