const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Local Expo module lives only in modules/ (autolinked once). Map the package
// name for JS imports without also installing a file: copy under node_modules
// (that double-install made expo-doctor report a native-module duplicate).
const localSafCopy = path.resolve(__dirname, 'modules/filmsort-saf-copy');
config.watchFolders = [...(config.watchFolders ?? []), localSafCopy];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'filmsort-saf-copy': localSafCopy,
};

module.exports = withNativeWind(config, { input: './global.css' });
