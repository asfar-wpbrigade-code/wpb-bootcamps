/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  // Jest's 5s default is too tight for the tests that generate real Ed25519
  // keypairs (did-web, issuer-keys): they pass comfortably but intermittently
  // blew the limit on slower machines, so the suite failed a different test on
  // each run. Raised rather than per-test, since any crypto test can hit this.
  testTimeout: 60000,
  // jose ships ESM-only; Jest's module system can't load raw `export`
  // syntax from node_modules by default, so let babel-jest transpile it.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
}
