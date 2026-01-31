import SpotifyWebApi from 'spotify-web-api-node';
import open from 'open';
import express from 'express';
import puppeteer from 'puppeteer';

import Config from '../config.js';
import Constants from '../util/constants.js';
import { logInfo, logFailure } from '../util/log-helper.js';

import { cliInputs } from './setup.js';

const {
  spotifyApi: { clientId, clientSecret },
} = Config;

const {
  AUTH: {
    SCOPES: {
      USERS_SAVED_PLAYLISTS,
      USERS_SAVED_TRACKS_ALBUMS,
      USERS_TOP_TRACKS,
    },
    STATE,
    REFRESH_ACCESS_TOKEN_SECONDS,
    TIMEOUT_RETRY,
  },
  INPUT_TYPES,
  MAX_LIMIT_DEFAULT,
  SERVER: { PORT, HOST, CALLBACK_URI },
} = Constants;

const spotifyApi = new SpotifyWebApi({
  clientId,
  clientSecret,
  redirectUri: `http://${HOST}:${PORT}${CALLBACK_URI}`,
});

const scopes = [
  USERS_SAVED_PLAYLISTS,
  USERS_SAVED_TRACKS_ALBUMS,
  USERS_TOP_TRACKS,
];

let nextTokenRefreshTime;

/**
 * Splits an array into chunks of specified size
 * @param {Array} array - The array to chunk
 * @param {number} size - The size of each chunk
 * @returns {Array[]} Array of chunks
 */
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Verifies and refreshes Spotify API credentials if needed
 * @returns {Promise<void>}
 */
const verifyCredentials = async () => {
  if (!nextTokenRefreshTime || nextTokenRefreshTime < new Date()) {
    nextTokenRefreshTime = new Date();
    nextTokenRefreshTime.setSeconds(
      nextTokenRefreshTime.getSeconds() + REFRESH_ACCESS_TOKEN_SECONDS
    );
    logInfo('Generating new access token');
    await checkCredentials();
  }
};

/**
 * Checks and refreshes Spotify API credentials
 * @returns {Promise<void>}
 */
const checkCredentials = async () => {
  if (await spotifyApi.getRefreshToken()) {
    await refreshToken();
  } else {
    const { inputs, username, password, login } = cliInputs();

    const requiresLogin = inputs.find(
      input =>
        input.type === INPUT_TYPES.SONG.SAVED_ALBUMS ||
        input.type === INPUT_TYPES.SONG.SAVED_PLAYLISTS ||
        input.type === INPUT_TYPES.SONG.SAVED_TRACKS ||
        input.type === INPUT_TYPES.EPISODE.SAVED_SHOWS
    );

    const requestingLogin = (username && password) || login;

    if (requiresLogin || requestingLogin) {
      await requestAuthorizedTokens();
    } else {
      await requestTokens();
    }
  }
};

/**
 * Requests authorized tokens using OAuth flow with optional auto-login
 * @returns {Promise<void>}
 */
const requestAuthorizedTokens = async () => {
  const { username, password } = cliInputs();
  const autoLogin = username.length > 0 && password.length > 0;
  const app = express();
  let resolve;
  const getCode = new Promise(_resolve => {
    resolve = _resolve;
  });
  app.get(CALLBACK_URI, (req, res) => {
    resolve(req.query.code);
    res.end('');
  });
  const server = await app.listen(PORT);

  const authURL = await spotifyApi.createAuthorizeURL(scopes, STATE, autoLogin);

  let browser = null;

  logInfo('Performing Spotify authentication...');

  if (autoLogin) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    try {
      await page.goto(authURL);
      await page.type('#login-username', username);
      await page.type('#login-password', password);
      await page.click('#login-button');
      await page
        .waitForSelector('#auth-accept, *[data-testid="auth-accept"]')
        .then(e => e.click());
    } catch (error) {
      logFailure(error.message);
      const screenshotPath = './failure.png';
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      throw new Error(
        `Authentication failed. Screenshot saved to ${screenshotPath}`
      );
    }
  } else {
    open(authURL);
  }

  const code = await getCode;
  setTokens((await spotifyApi.authorizationCodeGrant(code)).body);
  if (browser) {
    await browser.close();
  }
  server.close();
};

/**
 * Requests client credentials tokens (no user authorization)
 * @returns {Promise<void>}
 */
const requestTokens = async () => {
  setTokens((await spotifyApi.clientCredentialsGrant()).body);
};

/**
 * Refreshes the access token using refresh token
 * @returns {Promise<void>}
 */
const refreshToken = async () => {
  setTokens((await spotifyApi.refreshAccessToken()).body);
};

/**
 * Sets access and refresh tokens in Spotify API client
 * @param {Object} tokens - Token object from Spotify
 */
const setTokens = tokens => {
  spotifyApi.setAccessToken(tokens.access_token);
  spotifyApi.setRefreshToken(tokens.refresh_token);
};

/**
 * Wrapper for Spotify API calls with automatic retry and token refresh
 * @param {Function} apiCall - Async function that makes the API call
 * @returns {Promise<*>} API call result
 */
const callSpotifyApi = async function (apiCall) {
  const maxRetries = 5;
  let tries = 1;
  let lastError;

  while (tries <= maxRetries) {
    await verifyCredentials();

    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      logInfo(
        `Spotify API error: ${error.message}\n` +
        `Retry attempt ${tries}/${maxRetries} - waiting ${TIMEOUT_RETRY / 60} minutes`
      );
      
      if (tries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, TIMEOUT_RETRY * 1000));
      }
      tries++;
    }
  }
  
  throw new Error(`Spotify API failed after ${maxRetries} retries: ${lastError.message}`);
};

/**
 * Extracts track information from Spotify
 * @param {string[]} trackIds - Array of Spotify track IDs
 * @returns {Promise<Object[]>} Array of track objects with metadata
 */
export const extractTracks = async (trackIds) => {
  if (!trackIds || trackIds.length === 0) {
    return [];
  }

  let extractedTracks = [];
  const chunkedTracks = chunkArray(trackIds, 20);
  
  for (let x = 0; x < chunkedTracks.length; x++) {
    logInfo(`Extracting track set ${x + 1}/${chunkedTracks.length}`);
    const tracks = await callSpotifyApi(
      async () => (await spotifyApi.getTracks(chunkedTracks[x])).body.tracks
    );
    extractedTracks.push(...tracks);
  }
  
  extractedTracks = extractedTracks.filter(track => track);
  
  if (extractedTracks.length === 0) {
    return [];
  }

  const audioFeatures = (
    await extractTrackAudioFeatures(extractedTracks.map(track => track.id))
  ).filter(feature => feature);

  return extractedTracks.map(track => parseTrack(track, audioFeatures));
};

/**
 * Parses Spotify track data into standardized format
 * @param {Object} track - Spotify track object
 * @param {Object[]} audioFeatures - Array of audio feature objects
 * @returns {Object} Parsed track data
 */
const parseTrack = (track, audioFeatures) => {
  const audioFeature = audioFeatures.find(
    feature => feature.id === track.id
  );

  return {
    name: track.name,
    bpm: audioFeature?.tempo,
    popularity: track.popularity,
    artists: track.artists.map(artist => artist.name),
    album_name: track.album.name,
    release_date: track.album.release_date,
    track_number: track.track_number,
    total_tracks: track.album.total_tracks,
    cover_url: track.album.images?.[0]?.url,
    id: track.id,
  };
};

/**
 * Parses Spotify episode data into standardized format
 * @param {Object} episode - Spotify episode object
 * @param {number} index - Episode index in list
 * @returns {Object} Parsed episode data
 */
const parseEpisode = (episode, index = 0) => ({
  name: episode.name,
  artists: [episode.show.publisher],
  album_name: episode.show.name,
  release_date: episode.release_date,
  popularity: 100,
  bpm: 0,
  track_number: index + 1,
  total_tracks: episode.show.total_episodes,
  cover_url: episode.images?.[0]?.url,
  id: episode.id,
});

/**
 * Extracts playlist information and tracks from Spotify
 * @param {string} playlistId - Spotify playlist ID
 * @returns {Promise<Object>} Playlist data with tracks
 */
export const extractPlaylist = async (playlistId) => {
  const playlistInfo = await callSpotifyApi(
    async () => (await spotifyApi.getPlaylist(playlistId, { limit: 1 })).body
  );
  
  const tracks = [];
  let offset = 0;
  let playlistData;
  
  do {
    playlistData = await callSpotifyApi(
      async () => (await spotifyApi.getPlaylistTracks(playlistId, {
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${playlistData.total} tracks from playlist`);
    }
    
    tracks.push(...playlistData.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (tracks.length < playlistData.total);
  
  const validTracks = tracks.filter(item => item?.track);
  const trackIds = validTracks.map(item => item.track.id);
  const audioFeatures = await extractTrackAudioFeatures(trackIds);

  return {
    name: `${playlistInfo.name} - ${playlistInfo.owner.display_name}`,
    items: validTracks.map(item => parseTrack(item.track, audioFeatures)),
  };
};

/**
 * Extracts album information and tracks from Spotify
 * @param {string} albumId - Spotify album ID
 * @returns {Promise<Object>} Album data with tracks
 */
export const extractAlbum = async (albumId) => {
  const albumInfo = await callSpotifyApi(
    async () => (await spotifyApi.getAlbum(albumId, { limit: 1 })).body
  );
  
  const tracks = [];
  let offset = 0;
  let albumTracks;
  
  do {
    albumTracks = await callSpotifyApi(
      async () => (await spotifyApi.getAlbumTracks(albumId, {
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${albumTracks.total} tracks from album`);
    }
    
    tracks.push(...albumTracks.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (tracks.length < albumTracks.total);

  const validTracks = tracks.filter(track => track);
  const trackIds = validTracks.map(track => track.id);
  const tracksParsed = await extractTracks(trackIds);
  
  const primaryArtist = albumInfo.artists?.[0]?.name;
  if (primaryArtist) {
    tracksParsed.forEach(track => {
      track.artists = [primaryArtist, ...track.artists];
    });
  }

  return {
    name: `${albumInfo.name} - ${albumInfo.label}`,
    items: tracksParsed,
  };
};

/**
 * Extracts artist information from Spotify
 * @param {string} artistId - Spotify artist ID
 * @returns {Promise<Object>} Artist data
 */
export const extractArtist = async (artistId) => {
  const data = await callSpotifyApi(
    async () => (await spotifyApi.getArtist(artistId)).body
  );

  return {
    id: data.id,
    name: data.name,
    href: data.href,
  };
};

/**
 * Extracts all albums from an artist
 * @param {string} artistId - Spotify artist ID
 * @returns {Promise<Object[]>} Array of album objects
 */
export const extractArtistAlbums = async (artistId) => {
  const albums = [];
  let offset = 0;
  let artistAlbums;
  
  do {
    artistAlbums = await callSpotifyApi(
      async () => (await spotifyApi.getArtistAlbums(artistId, {
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${artistAlbums.total} albums from artist`);
    }
    
    albums.push(...artistAlbums.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (albums.length < artistAlbums.total);

  return albums;
};

/**
 * Extracts episode information from Spotify
 * @param {string[]} episodeIds - Array of Spotify episode IDs
 * @returns {Promise<Object[]>} Array of episode objects
 */
export const extractEpisodes = async (episodeIds) => {
  if (!episodeIds || episodeIds.length === 0) {
    return [];
  }

  const episodes = [];
  const chunkedEpisodes = chunkArray(episodeIds, 20);
  
  for (let x = 0; x < chunkedEpisodes.length; x++) {
    logInfo(`Extracting episode set ${x + 1}/${chunkedEpisodes.length}`);
    const episodesResult = await callSpotifyApi(
      async () => (await spotifyApi.getEpisodes(chunkedEpisodes[x])).body.episodes
    );
    const validEpisodes = episodesResult.filter(episode => episode);
    episodes.push(...validEpisodes);
  }

  return episodes.map((episode, index) => parseEpisode(episode, index));
};

/**
 * Extracts all episodes from a show
 * @param {string} showId - Spotify show ID
 * @returns {Promise<Object>} Show data with episodes
 */
export const extractShowEpisodes = async function (showId) {
  const showInfo = await callSpotifyApi(
    async () => (await spotifyApi.getShow(showId)).body
  );
  
  const episodes = [];
  let offset = 0;
  let showEpisodes;
  
  do {
    showEpisodes = await callSpotifyApi(
      async () => (await spotifyApi.getShowEpisodes(showId, {
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${showEpisodes.total} episodes from show`);
    }
    
    episodes.push(...showEpisodes.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (episodes.length < showEpisodes.total);

  const episodeIds = episodes.map(episode => episode.id);
  const extractedEpisodes = await extractEpisodes(episodeIds);

  return {
    name: `${showInfo.name} - ${showInfo.publisher}`,
    items: extractedEpisodes,
  };
};

/**
 * Extracts all saved shows for authenticated user
 * @returns {Promise<Object[]>} Array of show objects
 */
export const extractSavedShows = async function () {
  const shows = [];
  let offset = 0;
  let savedShows;
  
  do {
    savedShows = await callSpotifyApi(
      async () => (await spotifyApi.getMySavedShows({
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${savedShows.total} saved shows`);
    }
    
    shows.push(...savedShows.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (shows.length < savedShows.total);

  return shows.map(item => item.show);
};

/**
 * Extracts all saved albums for authenticated user
 * @returns {Promise<Object[]>} Array of album objects
 */
export const extractSavedAlbums = async function () {
  const albums = [];
  let offset = 0;
  let savedAlbums;
  
  do {
    savedAlbums = await callSpotifyApi(
      async () => (await spotifyApi.getMySavedAlbums({
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${savedAlbums.total} saved albums`);
    }
    
    albums.push(...savedAlbums.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (albums.length < savedAlbums.total);

  return albums.map(item => item.album);
};

/**
 * Extracts all saved playlists for authenticated user
 * @returns {Promise<Object[]>} Array of playlist objects
 */
export const extractSavedPlaylists = async function () {
  const playlists = [];
  let offset = 0;
  let savedPlaylists;
  
  do {
    savedPlaylists = await callSpotifyApi(
      async () => (await spotifyApi.getUserPlaylists({
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    if (offset === 0) {
      logInfo(`Extracting ${savedPlaylists.total} saved playlists`);
    }
    
    playlists.push(...savedPlaylists.items);
    offset += MAX_LIMIT_DEFAULT;
  } while (playlists.length < savedPlaylists.total);

  return playlists;
};

/**
 * Extracts all saved tracks for authenticated user
 * @returns {Promise<Object>} Object containing saved tracks
 */
export const extractSavedTracks = async function () {
  const tracks = [];
  let offset = 0;
  let savedTracks;
  
  do {
    savedTracks = await callSpotifyApi(
      async () => (await spotifyApi.getMySavedTracks({
        limit: MAX_LIMIT_DEFAULT,
        offset,
      })).body
    );
    
    tracks.push(...savedTracks.items.map(item => item.track));
    offset += MAX_LIMIT_DEFAULT;
    logInfo(`Extracting saved tracks ${tracks.length}/${savedTracks.total}`);
  } while (tracks.length < savedTracks.total);
  
  const validTracks = tracks.filter(track => track);
  const trackIds = validTracks.map(track => track.id);
  const audioFeatures = await extractTrackAudioFeatures(trackIds);

  return {
    name: 'Saved Tracks',
    items: validTracks.map(track => parseTrack(track, audioFeatures)),
  };
};

/**
 * Extracts audio features for tracks (BPM, tempo, etc.)
 * @param {string[]} trackIds - Array of Spotify track IDs
 * @returns {Promise<Object[]>} Array of audio feature objects
 */
export const extractTrackAudioFeatures = async function (trackIds) {
  if (!trackIds || trackIds.length === 0) {
    return [];
  }

  const audioFeatures = [];
  const chunks = chunkArray(trackIds, MAX_LIMIT_DEFAULT);
  
  for (const chunk of chunks) {
    const features = await callSpotifyApi(
      async () => (await spotifyApi.getAudioFeaturesForTracks(chunk)).body.audio_features
    );
    audioFeatures.push(...features);
  }

  return audioFeatures.filter(feature => feature);
};
