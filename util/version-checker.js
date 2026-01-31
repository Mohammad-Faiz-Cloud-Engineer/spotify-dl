import axios from 'axios';
import meow from 'meow';

/**
 * Checks if a newer version is available on GitHub
 * @returns {Promise<void>}
 */
const checkVersion = async () => {
  try {
    const response = await axios.default({
      url: 'https://api.github.com/repos/SwapnilSoni1999/spotify-dl/tags',
      timeout: 5000,
    });

    if (!response.data || response.data.length === 0) {
      return;
    }

    const latestVersion = response.data[0].name;
    const pkg = meow('', { importMeta: import.meta }).pkg;

    if (!pkg || !pkg.version) {
      return;
    }

    if (pkg.version < latestVersion) {
      console.log(
        [
          '\n========================================',
          '         Update Available!',
          '========================================',
          `Current version: ${pkg.version}`,
          `Latest version:  ${latestVersion}`,
          '',
          'Update with:',
          'npm install -g https://github.com/swapnilsoni1999/spotify-dl',
          '========================================\n',
        ].join('\n')
      );
    }
  } catch (error) {
    // Silently fail - version check is not critical
    return;
  }
};

export default checkVersion;
