import dotenv from 'dotenv';
import { fetch as UndiciFetch } from 'undici';
import prompts from 'prompts';

dotenv.config();

const Colors = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Cyan: '\x1b[36m',
  Green: '\x1b[32m',
  Yellow: '\x1b[33m',
  Red: '\x1b[31m',
  White: '\x1b[97m',
};

const KEY = process.env.API_KEY;
const SESSID = process.env.SESSION_ID;

if (!KEY || !SESSID) {
  console.error(`${Colors.Red}[ERROR]:${Colors.White} API_KEY or SESSION_ID not set in .env${Colors.Reset}`);
  process.exit(1);
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

interface ScrobbleResponse {
  scrobbles?: {
    '@attr': {
      accepted: string;
    };
  };
  error?: number;
  message?: string;
}

const Logger = {
  Info: (Message: string) => {
    console.log(`${Colors.Cyan}[INFO]:${Colors.White} ${Message}${Colors.Reset}`);
  },
  Success: (Message: string) => {
    console.log(`${Colors.Green}[SUCCESS]:${Colors.White} ${Message}${Colors.Reset}`);
  },
  Error: (Message: string) => {
    console.error(`${Colors.Red}[ERROR]:${Colors.White} ${Message}${Colors.Reset}`);
  }
};

function Clean(Title: string): string {
  return Title.replace(/[\x00-\x1F\x7F]/g, '');
}

async function Fetch(Artist: string, Album: string): Promise<Track[]> {
  const CleanAlbum = Clean(Album);
  const Variants = [
    encodeURIComponent(CleanAlbum),
    encodeURIComponent(CleanAlbum.normalize('NFC')),
    encodeURIComponent(CleanAlbum.normalize('NFKC')),
    encodeURI(CleanAlbum),
  ];

  for (const EncodedAlbum of Variants) {
    const Url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${KEY}&artist=${encodeURIComponent(Artist)}&album=${EncodedAlbum}&format=json`;
    
    try {
      const Response = await UndiciFetch(Url);
      if (!Response.ok) continue;
      
      const Data: AlbumData = await Response.json();
      const Track = Data.album?.tracks?.track;
      
      if (Track) {
        return Array.isArray(Track) ? Track : [Track];
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error('Album or tracks not found');
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

  const Json = await Response.json() as ScrobbleResponse;

  if (Json.error === 29 && Json.message?.includes('Rate Limit Exceeded')) {
    throw new Error('Scrobbling limit hit (24h cooldown)');
  }

  return Json;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function Main() {
  try {
    const { Artist, Album, Repeat } = await prompts([
      { type: 'text', name: 'Artist', message: 'Enter artist name:' },
      { type: 'text', name: 'Album', message: 'Enter album name:' },
      {
        type: 'number',
        name: 'Repeat',
        message: 'How many times to scrobble?',
        validate: (Value) => (Value > 0 ? true : 'Must be a positive number dummy'),
      },
    ]);

    if (!Artist || !Album || !Repeat) {
      throw new Error('All inputs are required');
    }

    Logger.Info(`Fetching tracks for "${Album}" by ${Artist}`);
    const Tracks = await Fetch(Artist, Album);

    Logger.Info(`Found ${Tracks.length} track(s)`);
    Tracks.forEach((TrackItem, Index) => {
      console.log(`${Colors.Yellow}${Index + 1}.${Colors.White} ${TrackItem.name}${Colors.Reset}`);
    });

    let Limited = false;
    let Attempt = 0;

    while (Attempt < Repeat && !Limited) {
      try {
        const Result = await Scrobble(Artist, Album, Tracks);
        const Accepted = Result.scrobbles && parseInt(Result.scrobbles['@attr'].accepted, 10) > 0;

        if (Accepted) {
          Logger.Success(`Attempt #${Attempt + 1} completed`);
          Attempt++;
          await sleep(1000);
        } else {
          Logger.Error(`Scrobble #${Attempt + 1} failed: ${JSON.stringify(Result)}`);
          await sleep(2000);
        }
      } catch (Err) {
        const ErrorMsg = Err instanceof Error ? Err.message : String(Err);

        if (ErrorMsg.includes('429')) {
          Logger.Error(`Rate limit hit at attempt #${Attempt + 1}, retrying after delay...`);
          await sleep(5000);
        } else if (ErrorMsg.includes('Scrobbling limit hit') || ErrorMsg.includes('24h cooldown')) {
          Logger.Error('Last.fm 24h scrobble limit hit, stopping further attempts');
          Limited = true;
        } else {
          Logger.Error(`Scrobble #${Attempt + 1} error: ${ErrorMsg}`);
          Attempt++;
          await sleep(2000);
        }
      }
    }

    Logger.Info(Limited ? 'Scrobbling stopped due to last.fm daily limit' : 'Scrobbling done');

  } catch (Err) {
    Logger.Error(Err instanceof Error ? Err.message : String(Err));
  }
}

Main();
