# Mojian · Warm Paper

A local novel writing studio with a warm ivory canvas, forest-green accents, and bookish typography. Runs on Windows with Node.js 22 or newer and no npm dependencies.

## Quick start

Double-click **start.cmd** to open http://127.0.0.1:3210. The launcher finds Node.js on your PATH or in the local Codex runtime.

Alternatively:

```powershell
node server.mjs
```

Set **OPENAI_API_KEY** as a Windows environment variable to enable AI features. Never put the key in source files or Git. Restart the server after changing environment variables.

Optional configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| OPENAI_TEXT_MODEL | gpt-4.1 | Writing model |
| OPENAI_IMAGE_MODEL | gpt-image-2 | Image model |
| PORT | 3210 | Local server port |

Model access depends on your API account. The launcher runs the server in the background. To stop it, end the corresponding node.exe process in Task Manager; for a manually started server, press Ctrl+C. Wait for **Saved locally** before stopping the server.

## Features

- Multiple books and chapters, with editable titles.
- Manuscript, outline, character notes, and worldbuilding.
- Local autosave, save-error feedback, and version conflict protection across windows.
- Character count, reading-time estimate, font controls, and focus mode.
- AI continuation, polishing, expansion, and outlines from explicitly selected content.
- Ink-wash, cinematic, and storybook illustrations with a local gallery.
- Local AI draft history, TXT exports, and the last 50 save snapshots.
- English interface and documentation; manuscripts can be written in any language.

## Local data

All creative content stays in the project folder under **local-data/**:

| Path | Contents |
| --- | --- |
| library.json | Books, chapters, and story notes |
| backups/ | Last 50 snapshots taken before saving |
| drafts/ | Generated AI drafts |
| images/ | Generated images and metadata |
| exports/ | TXT exports |
| server.log / server-error.log | Startup logs, without manuscripts or API keys |

To restore a snapshot, stop the server, preserve the current library.json, copy a chosen backup to library.json, then restart. The server refuses to overwrite a corrupt library. These backups are on the same disk, so they do not protect against disk failure. Use a local device you control for additional backups.

## AI and privacy

An AI request is sent only after you click Generate and confirm its preview. It contains the displayed excerpt and instructions plus the fixed writing or illustration instructions. Other chapters and story notes are not attached automatically.

Text requests use **store: false**. The API key is read by the local server and never sent to the browser. AI output follows your requested language, otherwise the excerpt language, with English as the fallback.

Local storage does not mean AI processing happens offline. OpenAI processes the content you confirm under its API data policies, and usage charges apply. Writing and local saving work without a key or internet access.

References: [Text generation](https://developers.openai.com/api/docs/guides/text), [Responses storage](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Image generation](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Public source, private manuscripts

The public GitHub repository contains application source only. The website runs on your computer; it does not need cloud hosting.

.gitignore excludes everything by default and explicitly allows reviewed source files. Manuscripts, images, drafts, exports, backups, logs, and secrets are excluded. Git hooks check the source allowlist and common API-key patterns before commits and pushes, including tracked history before a push.

Enable hooks after cloning:

```powershell
git config core.hooksPath .githooks
node scripts/check-repository.mjs
```

These checks prevent accidental inclusion; they cannot prevent deliberately bypassing hooks or pasting private content into an allowed source file. Do not force-add local data or enable third-party cloud synchronization for it.

## Development and checks

Plain Node.js HTTP server and native HTML, CSS, and JavaScript. No runtime dependencies, telemetry, remote fonts, or persistent browser storage of manuscripts.

The server listens only on 127.0.0.1. It checks Host, Origin, and Fetch Metadata, requires a per-session token for writes, and serves only explicitly allowed static files.

```powershell
node --test tests/server.test.mjs
node scripts/check-repository.mjs --history
```

Tests mock AI responses without paid API calls. They cover save/reload, revision conflicts, corrupt-data protection, external-origin rejection, explicit AI confirmation, selected-content isolation, and local drafts, images, and exports.
