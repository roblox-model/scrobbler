
# Scrobbler

**Scrobbler** is a tool that repeatedly scrobbles tracks from any album to your OpenScrobbler and Last.fm account, this tool was made for **boosting stats or faking play history**, all you need is an API key from Last.fm and a valid OpenScrobbler session ID

## Requirements

- Node.js v21.6.1 or higher
- npm (or another package manager like Yarn or pnpm)
- TypeScript and `tsx` (install globally via `npm install -g typescript tsx`)
- A `.env` file with:
  ```
  API_KEY=your_lastfm_api_key
  SESSION_ID=your_openscrobbler_session_id
  ```

### How to get API Key and Session ID

**Last.fm API Key:**

1. Go to the [Last.fm API account page](https://www.last.fm/api/account/create)
2. Log in with your Last.fm account
3. Fill in the application name and description
4. Submit the form to receive your API key
5. Copy the API key and paste it into your `.env` file as `API_KEY`

**OpenScrobbler Session ID (PHPSESSID):**

1. Log in to your OpenScrobbler account on your browser
2. Open your developer tools (Ctrl+Shift+I)
3. Go to the “Application” or “Storage” tab, then find “Cookies” for the OpenScrobbler domain
4. Look for the cookie named `PHPSESSID`
5. Copy the value of `PHPSESSID` and paste it into your `.env` file as `SESSION_ID`

## Installation

1. Clone this repository
2. Navigate into the directory
3. Run `npm install` to install dependencies

## Usage

1. Make sure your `.env` file is correctly set
2. Run `tsx .`
3. Follow the prompt
