/**
 * Cleans output path by removing invalid filesystem characters
 * @param {string} output - Path to clean
 * @returns {string} Cleaned path
 */
export const cleanOutputPath = function (output) {
  if (!output) {
    return '';
  }
  
  return output.replace(/[&/\\#+$!"~.%:*?<>{}|]/g, '');
};

/**
 * Removes query parameters from URL
 * @param {string} url - URL to clean
 * @returns {string} URL without query parameters
 */
export const removeQuery = function (url) {
  if (!url) {
    return '';
  }
  
  return url.split('?')[0];
};

/**
 * Splits date string into components
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Object} Object with year, month, day properties
 */
export const splitDates = function (dateString) {
  if (!dateString) {
    return { year: '', month: '', day: '' };
  }

  const dateSplits = dateString.split('-');

  return {
    year: dateSplits[0] || '',
    month: dateSplits[1] || '',
    day: dateSplits[2] || '',
  };
};
