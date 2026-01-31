/**
 * Parses Spotify/YouTube URL and determines content type
 * @param {string} inputUrl - URL to parse
 * @returns {string} Content type identifier
 * @throws {Error} If URL format is invalid
 */
export default inputUrl => {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('Invalid URL: URL must be a non-empty string');
  }

  const urlLower = inputUrl.toLowerCase();

  if (urlLower.includes('youtube')) {
    return 'youtube';
  }
  
  if (urlLower.includes('/track/')) {
    return 'song';
  }
  
  if (urlLower.includes('/playlist/')) {
    return 'playlist';
  }
  
  if (urlLower.includes('/album/')) {
    return 'album';
  }
  
  if (urlLower.includes('/artist/')) {
    return 'artist';
  }
  
  if (urlLower.includes('/show/')) {
    return 'show';
  }
  
  if (urlLower.includes('/episode/')) {
    return 'episode';
  }

  throw new Error('Invalid URL: Unsupported Spotify or YouTube URL format');
};
