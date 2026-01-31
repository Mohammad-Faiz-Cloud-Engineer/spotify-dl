import fs from 'fs';

import NodeID3 from 'node-id3';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';

import { logSuccess, logInfo } from '../util/log-helper.js';
import Constants from '../util/constants.js';
import { splitDates } from '../util/filters.js';

/**
 * Downloads and converts album cover to JPEG format
 * @param {string} uri - Cover image URL
 * @param {string} filename - Output filename
 * @returns {Promise<void>}
 */
const downloadAndSaveCover = function (uri, filename) {
  return new Promise(async (resolve, reject) => {
    try {
      const cover = await axios.default({
        method: 'GET',
        url: uri,
        responseType: 'stream',
        timeout: 30000,
      });

      const ffmpegCommand = ffmpeg();
      ffmpegCommand
        .on('error', error => {
          reject(error);
        })
        .on('end', () => {
          resolve();
        })
        .input(cover.data)
        .save(filename)
        .format('jpg');
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Merges metadata and album art into audio file
 * @param {string} output - Path to audio file
 * @param {Object} songData - Song metadata object
 * @returns {Promise<void>}
 */
const mergeMetadata = async (output, songData) => {
  if (!output || !songData) {
    logInfo('Invalid output path or song data for metadata merge');
    return;
  }

  const coverFileName = output.slice(0, output.length - 3) + 'jpg';
  const coverURL = songData.cover_url;
  
  if (coverURL) {
    let downloadAttempts = 0;
    const maxAttempts = 2;
    
    while (downloadAttempts < maxAttempts) {
      try {
        await downloadAndSaveCover(coverURL, coverFileName);
        break;
      } catch (error) {
        downloadAttempts++;
        if (downloadAttempts === 1) {
          logInfo('Album cover download failed, retrying...');
        } else {
          logInfo('Album cover download failed, using generic image');
        }
      }
    }
  }

  if (!fs.existsSync(coverFileName)) {
    try {
      fs.copyFileSync(Constants.YOUTUBE_SEARCH.GENERIC_IMAGE, coverFileName);
    } catch (error) {
      logInfo(`Failed to copy generic image: ${error.message}`);
    }
  }

  const dateSplits = splitDates(songData.release_date);
  const firstArtist = songData.artists?.[0] || '';
  const allArtists = songData.artists?.join('/') || '';
  
  const metadata = {
    artist: firstArtist,
    originalArtist: firstArtist,
    albumArtist: allArtists,
    composer: firstArtist,
    performerInfo: allArtists,
    author: firstArtist,
    album: songData.album_name || '',
    title: songData.name || '',
    bpm: songData.bpm ? Math.round(songData.bpm).toString() : undefined,
    year: dateSplits.year,
    date: `${dateSplits.day}${dateSplits.month}`,
    trackNumber: `${songData.track_number || 1}/${songData.total_tracks || 1}`,
    popularimeter: {
      email: 'spotify-dl@example.com',
      rating: Math.round(songData.popularity * Constants.FFMPEG.RATING_CONSTANT).toString(),
      counter: 0,
    },
    APIC: fs.existsSync(coverFileName) ? coverFileName : undefined,
    unsynchronisedLyrics: songData.lyrics ? {
      language: 'eng',
      text: songData.lyrics,
    } : undefined,
  };

  try {
    NodeID3.update(metadata, output);
    logSuccess('Metadata merged successfully');
  } catch (error) {
    logInfo(`Failed to merge metadata: ${error.message}`);
  }

  if (fs.existsSync(coverFileName)) {
    try {
      fs.unlinkSync(coverFileName);
    } catch (error) {
      logInfo(`Failed to delete temporary cover file: ${error.message}`);
    }
  }
};

export default mergeMetadata;
