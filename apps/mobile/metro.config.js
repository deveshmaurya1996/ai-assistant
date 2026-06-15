const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = process.env.EXPO_PROJECT_ROOT
  ? path.resolve(process.env.EXPO_PROJECT_ROOT)
  : __dirname;

const config = getDefaultConfig(projectRoot);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-secure-store') {
    return { type: 'empty' };
  }
  if (moduleName === '@siteed/audio-ui') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('@siteed/audio-ui/dist/index.cjs.js'),
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
