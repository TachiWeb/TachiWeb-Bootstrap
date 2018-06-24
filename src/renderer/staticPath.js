'use strict';

// eslint-disable-next-line no-process-env
const isDevelopment = process.env.NODE_ENV === 'development';
const staticPath = isDevelopment ? __static : __dirname.replace(/app\.asar$/, 'static');

module.exports = staticPath;