import path from 'path';
import fs from 'fs';

import downloader from '../lib/downloader.js';
import { writeId, findId } from '../lib/cache.js';
import mergeMetadata from '../lib/metadata.js';
import { cliInputs } from '../lib/setup.js';
import downloadSubtitles from '../lib/subtitle-downloader.js';

import getLinks from './get-link.js';
import { cleanOutputPath } from './filters.js';
import Constants from './constants.js';
import {
  getTrack,
  getPlaylist,
  getArtistAlbums,
  getEpisode,
  getShowEpisodes,
  getSavedShows,
  getSavedAlbums,
  getSavedPlaylists,
  getSavedTracks,
  getAlbum,
} from './get-songdata.js';
import { logSuccess, logInfo, logFailure } from './log-helper.js';
import { generateTemplateString } from './format-generators.js';

const {
  INPUT_TYPES,
  YOUTUBE_SEARCH: { GENERIC_IMAGE },
} = Constants;

const {
  inputs,
  extraSearch,
  output,
  outputOnly,
  downloadReport,
  downloadLyrics,
  searchFormat,
  exclusionFilters,
  outputFormat,
  outputFileType,
} = cliInputs();

/**
 * Generates output file path for an item
 * @param {string} itemName - Item name
 * @param {string} albumName - Album name
 * @param {string} artistName - Artist name
 * @returns {string} Full output path
 */
const itemOutputPath = (itemName, albumName, artistName) => {
  const cleanedItemName = cleanOutputPath(itemName || '_');
  const generatedPathSegments = cleanOutputPath(
    generateTemplateString(cleanedItemName, albumName, artistName, outputFormat)
  ).split('___');
  
  const pathSegments = outputOnly ? [cleanedItemName] : generatedPathSegments;
  
  return `${path.join(path.normalize(output), ...pathSegments)}.${outputFileType}`;
};

/**
 * Downloads all items in a list
 * @param {Object} list - List containing items to download
 * @returns {Promise<Object>} List with download results
 */
const downloadList = async list => {
  list.name = list.name.replace(/\//g, '-');
  const totalItems = list.items.length;
  
  logInfo(`Downloading: ${list.name}`);
  logInfo(`Total Items: ${totalItems}`);
  
  let currentCount = 0;
  
  for (const nextItem of list.items) {
    currentCount++;
    
    const itemId = nextItem.id;
    const itemName = nextItem.name;
    const albumName = nextItem.album_name;
    const artistName = nextItem.artists?.[0] || 'Unknown Artist';
    const fullItemPath = itemOutputPath(itemName, albumName, artistName);
    const itemDir = path.dirname(fullItemPath);
    
    const cached = findId(itemId, itemDir);

    if (cached) {
      nextItem.cached = true;
      continue;
    }

    logInfo(
      [
        `Progress: ${currentCount}/${totalItems}`,
        `Artist: ${artistName}`,
        `Album: ${albumName}`,
        `Item: ${itemName}`,
      ].join('\n')
    );

    try {
      fs.mkdirSync(itemDir, { recursive: true });
    } catch (error) {
      logFailure(`Failed to create directory: ${error.message}`);
      nextItem.failed = true;
      continue;
    }

    if (downloadLyrics) {
      nextItem.lyrics = await downloadSubtitles(itemName, artistName);
    }

    const ytLinks = nextItem.URL
      ? [nextItem.URL]
      : await getLinks({
          itemName,
          albumName,
          artistName,
          extraSearch,
          searchFormat,
          type: list.type,
          exclusionFilters,
        });

    if (!ytLinks || ytLinks.length === 0) {
      logFailure(`No YouTube links found for: ${itemName}`);
      nextItem.failed = true;
      continue;
    }

    const outputFilePath = path.resolve(fullItemPath);
    const downloadSuccessful = await downloader(ytLinks, outputFilePath);

    if (downloadSuccessful) {
      await mergeMetadata(outputFilePath, nextItem);
      writeId(itemDir, itemId);
      nextItem.failed = false;
    } else {
      nextItem.failed = true;
    }
  }
  
  logSuccess(`Finished processing: ${list.name}\n`);
  
  return list;
};

/**
 * Generates download report showing success/failure statistics
 * @param {Object[]} listResults - Array of download results
 */
const generateReport = async listResults => {
  if (!listResults || listResults.length === 0) {
    return;
  }

  logInfo('\n========================================');
  logInfo('         Download Report');
  logInfo('========================================\n');
  
  listResults.forEach(result => {
    const listItems = result.items;
    const totalItems = listItems.length;
    const failedItems = listItems.filter(item => item.failed);
    const successCount = totalItems - failedItems.length;
    
    logInfo(
      `${result.name} (${result.type}): ${successCount}/${totalItems} successful`
    );
    
    if (failedItems.length > 0) {
      logFailure(`\nFailed items (${failedItems.length}):`);
      failedItems.forEach(item => {
        logFailure(
          `  • ${item.name} - ${item.artists?.[0] || 'Unknown'} (${item.album_name})`
        );
      });
      console.log('');
    }
  });
  
  logInfo('========================================\n');
};

/**
 * Processes a single input and returns lists to download
 * @param {Object} input - Input configuration
 * @returns {Promise<Object[]>} Array of lists to download
 */
const processInput = async input => {
  const lists = [];
  const URL = input.url;

  switch (input.type) {
    case INPUT_TYPES.SONG.SONG: {
      const track = await getTrack(URL);
      lists.push({
        items: [track],
        name: `${track.name} - ${track.artists[0]}`,
        type: input.type,
      });
      break;
    }
    
    case INPUT_TYPES.SONG.PLAYLIST: {
      const list = await getPlaylist(URL);
      list.type = input.type;
      lists.push(list);
      break;
    }
    
    case INPUT_TYPES.SONG.ALBUM: {
      const list = await getAlbum(URL);
      list.type = input.type;
      lists.push(list);
      break;
    }
    
    case INPUT_TYPES.SONG.ARTIST: {
      const artistAlbumInfos = await getArtistAlbums(URL);
      artistAlbumInfos.forEach(list => {
        list.type = input.type;
        lists.push(list);
      });
      break;
    }
    
    case INPUT_TYPES.EPISODE.EPISODE: {
      const episode = await getEpisode(URL);
      if (episode) {
        lists.push({
          items: [episode],
          name: `${episode.name} - ${episode.album_name}`,
          type: input.type,
        });
      } else {
        logFailure('Failed to find episode. Authentication may be required.');
      }
      break;
    }
    
    case INPUT_TYPES.EPISODE.SHOW: {
      const list = await getShowEpisodes(URL);
      list.type = input.type;
      lists.push(list);
      break;
    }
    
    case INPUT_TYPES.EPISODE.SAVED_SHOWS: {
      const savedShowsInfo = await getSavedShows();
      savedShowsInfo.forEach(list => {
        list.type = input.type;
        lists.push(list);
      });
      break;
    }
    
    case INPUT_TYPES.SONG.SAVED_ALBUMS: {
      const savedAlbumsInfo = await getSavedAlbums();
      savedAlbumsInfo.forEach(list => {
        list.type = input.type;
        lists.push(list);
      });
      break;
    }
    
    case INPUT_TYPES.SONG.SAVED_PLAYLISTS: {
      const savedPlaylistsInfo = await getSavedPlaylists();
      savedPlaylistsInfo.forEach(list => {
        list.type = input.type;
        lists.push(list);
      });
      break;
    }
    
    case INPUT_TYPES.SONG.SAVED_TRACKS: {
      const list = await getSavedTracks();
      list.type = input.type;
      lists.push(list);
      break;
    }
    
    case INPUT_TYPES.YOUTUBE: {
      lists.push({
        items: [
          {
            name: URL,
            artists: ['YouTube'],
            album_name: 'YouTube Download',
            release_date: null,
            cover_url: GENERIC_IMAGE,
            id: URL,
            URL,
          },
        ],
        name: 'YouTube Download',
        type: input.type,
      });
      break;
    }
    
    default: {
      throw new Error(
        `Unsupported URL type: ${input.type}. ` +
        'Please visit the GitHub repository to request support for this type.'
      );
    }
  }

  return lists;
};

/**
 * Main runner function
 * @returns {Promise<void>}
 */
const run = async () => {
  const listResults = [];
  
  for (const input of inputs) {
    logInfo(`Processing ${input.type}: ${input.url || 'saved items'}`);
    
    try {
      const lists = await processInput(input);

      for (const [index, list] of lists.entries()) {
        logInfo(`Downloading list ${index + 1}/${lists.length}`);
        const downloadResult = await downloadList(list);
        
        if (downloadReport) {
          listResults.push(downloadResult);
        }
      }
    } catch (error) {
      logFailure(`Failed to process ${input.type}: ${error.message}`);
    }
  }
  
  if (downloadReport) {
    await generateReport(listResults);
  }
  
  logSuccess('All downloads completed!');
};

export default run;
