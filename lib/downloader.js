import fs from 'fs';

import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import { SponsorBlock } from 'sponsorblock-api';

import Config from '../config.js';
import Constants from '../util/constants.js';
import {
  logStart,
  updateSpinner,
  logInfo,
  logSuccess,
} from '../util/log-helper.js';

import { cliInputs } from './setup.js';

const { youtubeDLConfig, isTTY } = Config;
const sponsorBlock = new SponsorBlock(1234);
const {
  SPONSOR_BLOCK: {
    CATEGORIES: {
      SPONSOR,
      INTRO,
      OUTRO,
      INTERACTION,
      SELF_PROMO,
      MUSIC_OFF_TOPIC,
    },
  },
  FFMPEG: { ASET, TIMEOUT_MINUTES },
} = Constants;

const SPONSOR_CATEGORIES = [
  SPONSOR,
  INTRO,
  OUTRO,
  INTERACTION,
  SELF_PROMO,
  MUSIC_OFF_TOPIC,
];

/**
 * Generates FFmpeg complex filter for removing sponsored segments
 * @param {string} link - YouTube video URL
 * @returns {Promise<string|null>} Complex filter string or null if no segments
 */
const sponsorComplexFilter = async link => {
  const videoID = new URLSearchParams(new URL(link).search).get('v');
  
  if (!videoID) {
    return null;
  }

  let segments = [];
  
  try {
    segments = (await sponsorBlock.getSegments(videoID, ...SPONSOR_CATEGORIES))
      .sort((a, b) => a.startTime - b.startTime)
      .reduce((acc, { startTime, endTime }) => {
        const previousSegment = acc[acc.length - 1];
        if (previousSegment && previousSegment.endTime > startTime) {
          acc[acc.length - 1].endTime = Math.max(endTime, previousSegment.endTime);
        } else {
          acc.push({ startTime, endTime });
        }
        return acc;
      }, []);
  } catch (error) {
    return null;
  }

  if (segments.length === 0) {
    return null;
  }

  const complexFilter = [];
  
  segments.forEach((segment, i) => {
    const startTime = i === 0 ? 0 : segments[i - 1].endTime;
    const endTime = segment.startTime;
    complexFilter.push(`[0:a]atrim=start=${startTime}:end=${endTime},${ASET}[${i}a];`);
  });
  
  const lastSegment = segments[segments.length - 1];
  complexFilter.push(`[0:a]atrim=start=${lastSegment.endTime},${ASET}[${segments.length}a];`);
  
  const audioInputs = Array.from({ length: segments.length + 1 }, (_, i) => `[${i}a]`).join('');
  complexFilter.push(`${audioInputs}concat=n=${segments.length + 1}:v=0:a=1[outa]`);

  return complexFilter.join('\n');
};

/**
 * Progress callback for download tracking
 */
const progressFunction = (_, downloaded, total) => {
  const downloadedMb = (downloaded / 1024 / 1024).toFixed(2);
  const totalMb = (total / 1024 / 1024).toFixed(2);
  const downloadText = `Downloaded ${downloadedMb}/${totalMb} MB`;
  
  if (isTTY || downloadedMb % 1 === 0 || downloadedMb === totalMb) {
    updateSpinner(downloadText);
  }
};

/**
 * Configures youtube-dl with cookies if available
 * @returns {Object} Configuration object
 */
const getYoutubeDLConfig = () => {
  const { cookieFile } = cliInputs();
  
  if (!fs.existsSync(cookieFile)) {
    return youtubeDLConfig;
  }

  try {
    const cookieFileContents = fs
      .readFileSync(cookieFile, 'utf-8')
      .split('\n')
      .reduce((cookie, line) => {
        const segments = line.split(/[\t ]+/);
        if (segments.length === 7) {
          cookie += `${segments[5]}=${segments[6]}; `;
        }
        return cookie;
      }, '')
      .trim();

    return {
      ...youtubeDLConfig,
      requestOptions: {
        headers: {
          Cookie: cookieFileContents,
        },
      },
    };
  } catch (error) {
    logInfo(`Failed to read cookie file: ${error.message}`);
    return youtubeDLConfig;
  }
};

/**
 * Downloads audio from YouTube links and converts to specified format
 * @param {string[]} youtubeLinks - Array of YouTube video URLs
 * @param {string} output - Output file path
 * @returns {Promise<boolean>} Success status
 */
const downloader = async (youtubeLinks, output) => {
  if (!youtubeLinks || youtubeLinks.length === 0) {
    logInfo('No YouTube links provided for download');
    return false;
  }

  const { outputFileType } = cliInputs();
  let attemptCount = 0;
  let downloadSuccess = false;
  
  while (attemptCount < youtubeLinks.length && !downloadSuccess) {
    const link = youtubeLinks[attemptCount];
    logStart(`Attempting download from YouTube (attempt ${attemptCount + 1}/${youtubeLinks.length})`);
    
    const complexFilter = await sponsorComplexFilter(link);

    const doDownload = (resolve, reject) => {
      const download = ytdl(link, getYoutubeDLConfig());
      download.on('progress', progressFunction);
      
      const ffmpegCommand = ffmpeg({ timeout: TIMEOUT_MINUTES * 60 });
      
      if (complexFilter) {
        ffmpegCommand.complexFilter(complexFilter).map('[outa]');
      }
      
      ffmpegCommand
        .on('error', error => {
          reject(error);
        })
        .on('end', () => {
          resolve();
        })
        .input(download)
        .audioBitrate(256)
        .save(output)
        .format(outputFileType);
    };

    try {
      await new Promise(doDownload);
      downloadSuccess = true;
      logSuccess(`Download completed: ${output}`);
    } catch (error) {
      logInfo(`Download failed: ${error.message}`);
      attemptCount++;
      
      if (attemptCount < youtubeLinks.length) {
        logInfo('Retrying with next available link...');
      }
    }
  }

  if (!downloadSuccess) {
    logInfo(`All ${youtubeLinks.length} download attempts failed`);
  }

  return downloadSuccess;
};

export default downloader;
