const path = require('path');

const root = path.join(__dirname, '../../node_modules');

module.exports = {
  dependencies: {
    'react-native': { root: path.join(root, 'react-native') },
  },
};
