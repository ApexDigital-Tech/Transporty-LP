const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Limit maxWorkers to prevent worker OOM on Windows/CI
config.maxWorkers = 2;

// Intercept 'ws' Node module imports in client/mobile builds and return an empty module
// React Native has native WebSocket support and does not require Node's 'ws' or 'zlib'
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws' && platform !== 'node') {
    return {
      type: 'empty',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
