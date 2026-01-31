import Genius from 'genius-lyrics';

import { logInfo } from '../util/log-helper.js';

/**
 * Downloads lyrics from Genius for a given song
 * @param {string} itemName - Song/track name
 * @param {string} artistName - Artist name
 * @returns {Promise<string>} Lyrics text or empty string
 */
const downloadSubtitles = async (itemName, artistName) => {
  if (!itemName || !artistName) {
    logInfo('Invalid item name or artist name for lyrics download');
    return '';
  }

  const client = new Genius.Client();
  const searchTerm = `${itemName} - ${artistName}`;
  
  try {
    logInfo(`Searching for lyrics: ${searchTerm}`);
    const searches = await client.songs.search(searchTerm);
    
    if (!searches || searches.length === 0) {
      logInfo(`No lyrics found for: ${searchTerm}`);
      return '';
    }

    const firstSong = searches[0];
    const lyrics = await firstSong.lyrics();
    
    return lyrics ? lyrics.trim() : '';
  } catch (error) {
    logInfo(`Failed to download lyrics: ${error.message}`);
    return '';
  }
};

export default downloadSubtitles;
