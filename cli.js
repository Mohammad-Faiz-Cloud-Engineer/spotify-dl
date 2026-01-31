#!/usr/bin/env node

/*
  Copyright (c) 2021 Swapnil Soni

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
*/

import { startup } from './lib/setup.js';
import { logFailure } from './util/log-helper.js';
import Runner from './util/runner.js';

/**
 * Main entry point for the CLI application
 */
const main = async () => {
  try {
    startup();
    await Runner();
    process.exit(0);
  } catch (error) {
    logFailure('Application error occurred');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

main();
