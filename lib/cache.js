import fs from 'fs';
import path from 'path';

import { cliInputs } from './setup.js';
import { logInfo } from '../util/log-helper.js';

/**
 * Gets the cache file path, handling both relative and absolute paths
 * @param {string} dir - Directory path
 * @returns {string} Cache file path
 */
const getCacheFile = dir => {
  const { cacheFile } = cliInputs();
  const cacheFileIsRelative = cacheFile.startsWith('.');

  return cacheFileIsRelative ? path.join(dir, cacheFile) : cacheFile;
};

/**
 * Writes a Spotify ID to the cache file
 * @param {string} dir - Directory path
 * @param {string} id - Spotify ID to cache
 */
export const writeId = function (dir, id) {
  if (!dir || !id) {
    return;
  }

  try {
    const cacheFile = getCacheFile(dir);
    const cacheDir = path.dirname(cacheFile);
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.appendFileSync(cacheFile, `spotify ${id}\n`, 'utf-8');
  } catch (error) {
    logInfo(`Failed to write to cache: ${error.message}`);
  }
};

/**
 * Checks if a Spotify ID exists in the cache
 * @param {string} id - Spotify ID to search for
 * @param {string} dir - Directory path
 * @returns {boolean} True if ID is cached
 */
export const findId = function (id, dir) {
  if (!id || !dir) {
    return false;
  }

  try {
    const cacheFile = getCacheFile(dir);
    
    if (!fs.existsSync(cacheFile)) {
      return false;
    }

    const cacheContent = fs.readFileSync(cacheFile, 'utf-8');
    const cachedIds = cacheContent
      .split('\n')
      .map(line => line.replace('spotify ', '').trim())
      .filter(line => line);

    return cachedIds.includes(id);
  } catch (error) {
    logInfo(`Failed to read cache: ${error.message}`);
    return false;
  }
};
