# Astro Supabase Starter

![Astro Supabase Starter Preview](astro-supabase-starter-preview.png)

**View demo:** [https://astro-supabase-starter.netlify.app/](https://astro-supabase-starter.netlify.app/)

The Astro Supabase starter demonstrates how to integrate **Supabase** into an Astro project deployed on Netlify.

## Deploying to Netlify

If you click "Deploy to Netlify" button, it will create a new repo for you that looks exactly like this one, and sets that repo up immediately for deployment on Netlify.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-supabase-starter&fullConfiguration=true)

## Daily Ticker (`/ticker`)

A full-screen ticker-tape dashboard that runs at [`/ticker`](http://localhost:4321/ticker), and can be installed as an app from the browser.

From top to bottom:

- **7-day weather** for metro Detroit with color icons ([Open-Meteo](https://open-meteo.com), no API key). Change the city in ⚙ Settings.
- **Daily horoscope** for Capricorn (the sign can be changed in Settings). If the live horoscope services can't be reached, it shows an offline reading for the day.
- **MY DAY tape**: your schedule, projects, deadlines, events, reminders and timers, with live countdowns.
- **World / National / Metro Detroit news tapes**, pulled from BBC, NPR, ABC, WDIV, WXYZ, Michigan Public and Google News through `/api/ticker/news` and refreshed every 10 minutes.
- **TODAY**: big bold bullets for today's items, overdue and next-day deadlines, projects due this week, running timers and weather warnings. Click the circle to check an item off.

Items are saved in the browser (`localStorage`). Use **Export/Import** in Settings to move them between devices. Reminders, events and timers play a chime and show a toast when they're due, and can also send desktop notifications if you allow them. Deadlines alert 15 minutes early.

Shortcuts: `N` add, `M` manage items, `F` fullscreen (fullscreen also keeps the screen awake). Hover over a tape to pause it. Add `?compact` to the URL for a smaller widget layout.

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.14+                                       |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management  |
| [Netlify account](https://netlify.com/)                                      |
| [Netlify CLI](https://docs.netlify.com/cli/get-started/).                    |
| [Supabase account](https://supabase.com/)                                    |

### Set up the database

To use this template, you’ll need to set up and seed a new Supabase database.

1. Create a new Supabase project.
2. Run the SQL commands found in the `supabase/migrations` directory in the Supabase UI.
3. To seed the database with data, you can import the contents of the `supabase/seed.csv` file in the Supabase UI.

ℹ️ _Note: This template was created to be used with the Supabase extension for Netlify. If you don’t wish to use the Netlify Supabase extension, you will need to set the `SUPABASE_DATABASE_URL` and `SUPABASE_ANON_KEY` environment variables in the `.env` file._

### Install and run locally

1. Clone this repository, then run `npm install` in its root directory.

2. For the starter to have full functionality locally, please ensure you have an up-to-date version of Netlify CLI. Run:

```
npm install netlify-cli@latest -g
```

3. Link your local repository to the deployed Netlify site. This will ensure you're using the same runtime version for both local development and your deployed site.

```
netlify link
```

4. Then, run the Astro.js development server via Netlify CLI:

```
netlify dev --target-port 4321
```

If your browser doesn't navigate to the site automatically, visit [localhost:8888](http://localhost:8888).

## Support

If you get stuck along the way, get help in our [support forums](https://answers.netlify.com/).
