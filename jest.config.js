'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch:       ['**/__tests__/**/*.test.js'],
  transform:       {},   // pas de babel-jest — tests en CommonJS pur
  forceExit:       true,
};
