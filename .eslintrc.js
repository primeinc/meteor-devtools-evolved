const { merge } = require('lodash')

module.exports = merge(require('@tstt/eslint-config/index.js'), {
  plugins: ['jsdoc', 'react-hooks'],
  rules: {
    'global-require': 0,
    '@typescript-eslint/no-var-requires': 0,
    '@typescript-eslint/no-extra-semi': 0, // Conflicts with prettier
    '@typescript-eslint/no-inferrable-types': [
      2,
      {
        ignoreParameters: true,
        ignoreProperties: true,
      },
    ],
    // JSDoc validation - using modern eslint-plugin-jsdoc
    // These are ERRORS to enforce JSDoc requirements at pre-commit
    'jsdoc/require-jsdoc': [
      'error',
      {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: false,
          ClassDeclaration: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
        contexts: [
          'ExportNamedDeclaration > FunctionDeclaration',
          'ExportDefaultDeclaration > FunctionDeclaration',
        ],
      },
    ],
    'jsdoc/require-param-description': 'error',
    'jsdoc/require-returns-description': 'off',
    'jsdoc/check-param-names': 'error',
    'jsdoc/check-tag-names': 'error',
    'jsdoc/check-types': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-extra-semi': 0, // Conflicts with prettier
      },
    },
  ],
  globals: { Meteor: 'readonly', i18n: 'readonly' },
})
