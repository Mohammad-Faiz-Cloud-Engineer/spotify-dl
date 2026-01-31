import Constants from './constants.js';

const {
  YOUTUBE_SEARCH: { VALID_CONTEXTS },
} = Constants;

/**
 * Generates a formatted string by replacing template variables
 * @param {string} itemName - The item name (track/episode)
 * @param {string} albumName - The album/show name
 * @param {string} artistName - The artist/publisher name
 * @param {string} format - Template string with {variable} placeholders
 * @returns {string} Formatted string with variables replaced
 */
export const generateTemplateString = function (
  itemName,
  albumName,
  artistName,
  format
) {
  if (!format) {
    return '';
  }

  const contexts = format.match(/(?<=\{).+?(?=\})/g);
  
  if (!contexts || contexts.length === 0) {
    return format;
  }

  const invalidContexts = contexts.filter(
    context => !VALID_CONTEXTS.includes(context)
  );
  
  if (invalidContexts.length > 0) {
    throw new Error(`Invalid template contexts: ${invalidContexts.join(', ')}. Valid contexts are: ${VALID_CONTEXTS.join(', ')}`);
  }

  const contextMap = {
    itemName: itemName || '',
    albumName: albumName || '',
    artistName: artistName || '',
  };

  let result = format;
  contexts.forEach(context => {
    const value = contextMap[context];
    result = result.replace(`{${context}}`, value);
  });

  return result;
};
