import { promisify } from 'util';

import YoutubeSearch from 'yt-search';
import StringSimilarity from 'string-similarity';

import Constants from './constants.js';
import { logInfo } from './log-helper.js';
import { generateTemplateString } from './format-generators.js';

const {
  YOUTUBE_SEARCH: { MAX_MINUTES },
  INPUT_TYPES: { SONG },
} = Constants;

const search = promisify(YoutubeSearch);

/**
 * Searches YouTube and filters results based on criteria
 * @param {string} searchTerms - Search query
 * @param {string} type - Type of content (song, episode, etc.)
 * @param {string[]} exclusionFilters - Terms to exclude from results
 * @returns {Promise<string[]>} Array of YouTube URLs
 */
const findLinks = async (searchTerms, type, exclusionFilters) => {
  if (!searchTerms) {
    return [];
  }

  logInfo(`Searching YouTube: "${searchTerms}"`);
  
  try {
    const result = await search(searchTerms);
    const isSong = Object.values(SONG).includes(type);
    
    if (!result || !result.videos) {
      return [];
    }

    return result.videos
      .filter(video => {
        if (!exclusionFilters || exclusionFilters.length === 0) {
          return true;
        }
        
        const titleMatch = exclusionFilters.some(filter =>
          video.title.toLowerCase().includes(filter.toLowerCase())
        );
        const descMatch = exclusionFilters.some(filter =>
          video.description.toLowerCase().includes(filter.toLowerCase())
        );
        
        return !titleMatch && !descMatch;
      })
      .filter(video => {
        if (!video.seconds || video.seconds <= 0) {
          return false;
        }
        return !isSong || video.seconds < MAX_MINUTES * 60;
      })
      .slice(0, 10)
      .map(video => {
        if (video.url.startsWith('https://youtube.com')) {
          return video.url;
        }
        return `https://youtube.com${video.url}`;
      });
  } catch (error) {
    logInfo(`YouTube search failed: ${error.message}`);
    return [];
  }
};

/**
 * Gets YouTube links for a given song/episode using various search strategies
 * @param {Object} params - Search parameters
 * @param {string} params.itemName - Name of song/episode
 * @param {string} params.albumName - Name of album/show
 * @param {string} params.artistName - Name of artist/publisher
 * @param {string} params.extraSearch - Additional search terms
 * @param {string} params.searchFormat - Custom search format template
 * @param {string} params.type - Type of content
 * @param {string[]} params.exclusionFilters - Terms to exclude
 * @returns {Promise<string[]>} Array of YouTube URLs
 */
const getLinks = async ({
  itemName,
  albumName,
  artistName,
  extraSearch = '',
  searchFormat = '',
  type,
  exclusionFilters = [],
}) => {
  if (!itemName) {
    return [];
  }

  let links = [];
  
  if (searchFormat) {
    try {
      const customSearch = generateTemplateString(
        itemName,
        albumName,
        artistName,
        searchFormat
      );
      links = await findLinks(customSearch, type, exclusionFilters);
    } catch (error) {
      logInfo(`Custom search format failed: ${error.message}`);
    }
  }
  
  if (links.length > 0) {
    return links;
  }

  const extraSearchTerm = extraSearch ? ` ${extraSearch}` : '';
  const similarity = StringSimilarity.compareTwoStrings(
    itemName || '',
    albumName || ''
  );
  
  if (similarity < 0.5 && albumName) {
    links = await findLinks(
      `${albumName} - ${itemName}${extraSearchTerm}`,
      type,
      exclusionFilters
    );
  }
  
  if (links.length === 0 && artistName) {
    links = await findLinks(
      `${artistName} - ${itemName}${extraSearchTerm}`,
      type,
      exclusionFilters
    );
  }
  
  return links;
};

export default getLinks;
