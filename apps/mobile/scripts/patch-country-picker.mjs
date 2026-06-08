import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

let packagePath;
try {
  packagePath = path.dirname(require.resolve('react-native-country-picker-modal/package.json'));
} catch {
  process.exit(0);
}

const target = path.join(packagePath, 'lib', 'CountryModal.js');
const source = readFileSync(target, 'utf8');

if (source.includes("from 'react-native-safe-area-context'")) {
  process.exit(0);
}

const next = source.replace(
  "import { SafeAreaView, StyleSheet, Platform } from 'react-native';",
  "import { StyleSheet, Platform } from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';"
);

if (next === source) {
  console.warn('[patch-country-picker] CountryModal.js import pattern not found');
  process.exit(0);
}

writeFileSync(target, next);
console.log('[patch-country-picker] Updated CountryModal.js to use react-native-safe-area-context');
