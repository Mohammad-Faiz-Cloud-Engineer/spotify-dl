import {
  extractTracks,
  extractAlbum,
  extractArtist,
  extractArtistAlbums,
  extractPlaylist,
  extractEpisodes,
  extractShowEpisodes,
  extractSavedShows,
  extractSavedAlbums,
  extractSavedPlaylists,
  extractSavedTracks,
} from '../lib/api.js';

/**
 * Extracts Spotify ID from URL
 * @param {string} url - Spotify URL
 * @returns {string} Spotify ID
 */
const getID = url => {
  if (!url) {
    throw new Error('URL is required');
  }
  
  const splits = url.split('/');
  const id = splits[splits.length - 1];
  
  if (!id) {
    throw new Error('Invalid Spotify URL format');
  }
  
  return id;
};

/**
 * Gets track information from Spotify
 * @param {string} url - Spotify track URL
 * @returns {Promise<Object>} Track data
 */
export const getTrack = async function (url) {
  const tracks = await extractTracks([getID(url)]);
  return tracks[0];
};

/**
 * Gets album information from Spotify
 * @param {string} url - Spotify album URL
 * @returns {Promise<Object>} Album data with tracks
 */
export const getAlbum = async function (url) {
  return await extractAlbum(getID(url));
};

/**
 * Gets artist information from Spotify
 * @param {string} url - Spotify artist URL
 * @returns {Promise<Object>} Artist data
 */
export const getArtist = async function (url) {
  return await extractArtist(getID(url));
};

/**
 * Gets all albums from an artist
 * @param {string} url - Spotify artist URL
 * @returns {Promise<Object[]>} Array of album data
 */
export const getArtistAlbums = async function (url) {
  const artistResult = await getArtist(url);
  const albumsResult = await extractArtistAlbums(artistResult.id);
  const albumIds = albumsResult.map(album => album.id);
  
  const albumInfos = [];
  
  for (let x = 0; x < albumIds.length; x++) {
    const albumInfo = await extractAlbum(albumIds[x]);
    
    albumInfo.items = albumInfo.items.map(item => {
      item.artists = [artistResult.name, ...item.artists];
      return item;
    });
    
    albumInfos.push(albumInfo);
  }

  return albumInfos;
};

/**
 * Gets playlist information from Spotify
 * @param {string} url - Spotify playlist URL
 * @returns {Promise<Object>} Playlist data with tracks
 */
export const getPlaylist = async function (url) {
  return await extractPlaylist(getID(url));
};

/**
 * Gets episode information from Spotify
 * @param {string} url - Spotify episode URL
 * @returns {Promise<Object>} Episode data
 */
export const getEpisode = async function (url) {
  const episodes = await extractEpisodes([getID(url)]);
  return episodes[0];
};

/**
 * Gets all episodes from a show
 * @param {string} url - Spotify show URL
 * @returns {Promise<Object>} Show data with episodes
 */
export const getShowEpisodes = async function (url) {
  return await extractShowEpisodes(getID(url));
};

/**
 * Gets all saved shows for authenticated user
 * @returns {Promise<Object[]>} Array of show data with episodes
 */
export const getSavedShows = async function () {
  const shows = await extractSavedShows();
  const episodes = [];
  
  for (let x = 0; x < shows.length; x++) {
    episodes.push(await extractShowEpisodes(shows[x].id));
  }

  return episodes;
};

/**
 * Gets all saved albums for authenticated user
 * @returns {Promise<Object[]>} Array of album data
 */
export const getSavedAlbums = async function () {
  const albums = await extractSavedAlbums();
  const albumInfos = [];
  
  for (let x = 0; x < albums.length; x++) {
    albumInfos.push(await extractAlbum(albums[x].id));
  }

  return albumInfos;
};

/**
 * Gets all saved playlists for authenticated user
 * @returns {Promise<Object[]>} Array of playlist data
 */
export const getSavedPlaylists = async function () {
  const playlistsResults = await extractSavedPlaylists();
  const playlistIds = playlistsResults.map(playlist => playlist.id);
  const playlistInfos = [];
  
  for (let x = 0; x < playlistIds.length; x++) {
    playlistInfos.push(await extractPlaylist(playlistIds[x]));
  }

  return playlistInfos;
};

/**
 * Gets all saved tracks for authenticated user
 * @returns {Promise<Object>} Saved tracks data
 */
export const getSavedTracks = async function () {
  return await extractSavedTracks();
};
