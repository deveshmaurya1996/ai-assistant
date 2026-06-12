const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const MARKER = '// @generated pnpm-monorepo-paths';
const LEGACY_MARKER = '// @generated pnpm-windows-paths';
const RN_FROM_ANDROID = '../../../node_modules/react-native';
const RN_FROM_APP = '../../../../node_modules/react-native';
const RN_GRADLE_PLUGIN_FROM_ANDROID = '../../../node_modules/@react-native/gradle-plugin';

function patchSettingsGradle(contents) {
  if (!contents.includes(MARKER)) {
    contents = contents.replace(
      'expoAutolinking.useExpoModules()',
      `${MARKER}
expoAutolinking.projectRoot = new File(rootDir, "..").getAbsoluteFile()
expoAutolinking.useExpoModules()`,
    );
  }

  if (contents.includes('require.resolve(\'@react-native/gradle-plugin/package.json\'')) {
    contents = contents.replace(
      /def reactNativeGradlePlugin = new File\(\s*providers\.exec \{[^}]+\}\.standardOutput\.asText\.get\(\)\.trim\(\)\s*\)\.getParentFile\(\)\.absolutePath/,
      `def reactNativeGradlePlugin = new File(rootDir, "${RN_GRADLE_PLUGIN_FROM_ANDROID}").absolutePath`,
    );
  }

  if (contents.includes('includeBuild(expoAutolinking.reactNativeGradlePlugin)')) {
    contents = contents.replace(
      'includeBuild(expoAutolinking.reactNativeGradlePlugin)',
      `includeBuild(new File(rootDir, "${RN_GRADLE_PLUGIN_FROM_ANDROID}").absolutePath)`,
    );
  }

  return contents;
}

function patchAppBuildGradle(contents) {
  contents = contents.replace(
    new RegExp(`\\n?${LEGACY_MARKER}[\\s\\S]*?REACT_NATIVE_NODE_MODULES_DIR[^\n]*\\n`, 'm'),
    '\n',
  );

  if (!contents.includes(MARKER)) {
    const anchor = 'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()';
    if (contents.includes(anchor)) {
      contents = contents.replace(
        anchor,
        `${anchor}
${MARKER}
project.ext.REACT_NATIVE_NODE_MODULES_DIR = new File(projectDir, "${RN_FROM_APP}").absolutePath`,
      );
    }
  }

  contents = contents.replace(
    /reactNativeDir = new File\(projectDir, "[^"]*node_modules\/react-native"\)\.getAbsoluteFile\(\)/,
    `reactNativeDir = new File(projectDir, "${RN_FROM_APP}").getAbsoluteFile()`,
  );

  contents = contents.replace(
    /reactNativeDir = new File\(\["node", "--print", "require\.resolve\('react-native\/package\.json'\)"\]\.execute\(null, rootDir\)\.text\.trim\(\)\)\.getParentFile\(\)\.getAbsoluteFile\(\)/,
    `reactNativeDir = new File(projectDir, "${RN_FROM_APP}").getAbsoluteFile()`,
  );

  return contents;
}

function withAndroidPnpmPaths(config) {
  config = withSettingsGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = patchSettingsGradle(config.modResults.contents);
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = patchAppBuildGradle(config.modResults.contents);
    }
    return config;
  });

  return config;
}

module.exports = withAndroidPnpmPaths;
