import dotenv from 'dotenv';
dotenv.config();

import { fetch as UndiciFetch } from 'undici';
import prompts from 'prompts';

const ColorCodes = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Cyan: '\x1b[36m',
  Green: '\x1b[32m',
  Yellow: '\x1b[33m',
  Red: '\x1b[31m',
  White: '\x1b[97m',
};

const KEY = process.env.API_KEY ?? '';
const SESSID = process.env.SESSION_ID ?? '';

if (!KEY || !SESSID) {
  console.error(`${ColorCodes.Red}[ERROR]:${ColorCodes.White} API_KEY or SESSION_ID not set in .env${ColorCodes.Reset}`);
  process.exit(1);
}

function LogInfo(Message: string) {
  console.log(`${ColorCodes.Cyan}[INFO]:${ColorCodes.White} ${Message}${ColorCodes.Reset}`);
}

function LogSuccess(Message: string) {
  console.log(`${ColorCodes.Green}[SUCCESS]:${ColorCodes.White} ${Message}${ColorCodes.Reset}`);
}

function LogError(Message: string) {
  console.error(`${ColorCodes.Red}[ERROR]:${ColorCodes.White} ${Message}${ColorCodes.Reset}`);
}

interface Track {
  name: string;
}

interface AlbumData {
  album?: {
    tracks?: {
      track?: Track | Track[];
    };
  };
}

async function Fetch(Artist: string, Album: string): Promise<Track[]> {
  const Url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${KEY}&artist=${encodeURIComponent(Artist)}&album=${encodeURIComponent(Album)}&format=json`;
  const Response = await UndiciFetch(Url);

  if (!Response.ok) {
    throw new Error(`Failed to fetch album info: ${Response.status} ${Response.statusText}`);
  }

  const Data: AlbumData = await Response.json();

  if (!Data.album?.tracks?.track) {
    throw new Error('Album or tracks not found');
  }

  return Array.isArray(Data.album.tracks.track)
    ? Data.album.tracks.track
    : [Data.album.tracks.track];
}

interface ScrobbleResponse {
  scrobbles?: {
    '@attr': {
      accepted: string;
    };
  };
}

async function Scrobble(Artist: string, Album: string, Tracks: Track[]): Promise<ScrobbleResponse> {
  const Now = Math.floor(Date.now() / 1000);
  const Body = new URLSearchParams();

  Tracks.forEach((TrackItem, Index) => {
    Body.append(`artist[${Index}]`, Artist);
    Body.append(`track[${Index}]`, TrackItem.name);
    Body.append(`album[${Index}]`, Album);
    Body.append(`timestamp[${Index}]`, (Now + Index).toString());
  });

  const Headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": `PHPSESSID=${SESSID}`
  };

  const Response = await UndiciFetch('https://openscrobbler.com/api/v2/scrobble.php', {
    method: 'POST',
    headers: Headers,
    body: Body.toString(),
  });

  if (!Response.ok) {
    throw new Error(`Scrobble request failed: ${Response.status} ${Response.statusText}`);
  }

  return await Response.json() as ScrobbleResponse;
}

async function Main() {
  try {
    const Response = await prompts([
      { type: 'text', name: 'Artist', message: 'Enter artist name:' },
      { type: 'text', name: 'Album', message: 'Enter album name:' },
      {
        type: 'number',
        name: 'Repeat',
        message: 'How many times to scrobble?',
        validate: (Value) => (Value > 0 ? true : 'Must be a positive number dummy'),
      },
    ]);

    const { Artist, Album, Repeat } = Response;

    if (!Artist || !Album || !Repeat) {
      throw new Error('All inputs are required');
    }

    LogInfo(`Fetching tracks for "${Album}" by ${Artist}`);
    const Tracks = await Fetch(Artist, Album);

    LogInfo(`Found ${Tracks.length} track(s)`);
    Tracks.forEach((TrackItem, Index) => {
      console.log(`${ColorCodes.Yellow}${Index + 1}.${ColorCodes.White} ${TrackItem.name}${ColorCodes.Reset}`);
    });

    let Limited = false;

    for (let I = 0; I < Repeat; I++) {
      if (Limited) break;

      try {
        LogInfo(`Attempting scrobbling #${I + 1}`);
        const Result = await Scrobble(Artist, Album, Tracks);

        if (Result.scrobbles && parseInt(Result.scrobbles['@attr'].accepted, 10) > 0) {
          LogSuccess(`Attempt #${I + 1} completed`);
        } else {
          LogError(`Scrobble #${I + 1} failed: ${JSON.stringify(Result)}`);
        }
      } catch (Err) {
        const Msg = (Err as Error).message;

        if (Msg.includes('429')) {
          LogError(`Ratelimit hit at attempt #${I + 1}`);
          Limited = true;
        } else {
          LogError(`Scrobble #${I + 1} error: ${Msg}`);
        }
      }
    }

    if (!Limited) {
      LogSuccess('Scrobbling done');
    }
  } catch (Err) {
    if (Err instanceof Error) {
      LogError(Err.message);
    } else {
      LogError('Unknown error occurred (contact @rbxm on Discord)');
    }
  }
}

Main();