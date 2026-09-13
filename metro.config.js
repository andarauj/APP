const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// NativeWind v4: `input` must be the project-root CSS that app/_layout imports
// via `../global.css`. Wrong path / missing wrapper → Metro hangs or
// "Unable to resolve ./global.css" during expo-router require.context.
module.exports = withNativeWind(config, { input: './global.css' });
