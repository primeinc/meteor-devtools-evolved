const { merge } = require('lodash')

module.exports = merge(require('@tstt/eslint-config/index.js'), {
  plugins: ['jsdoc'],
  rules: {
    'global-require': 0,
    '@typescript-eslint/no-var-requires': 0,
    '@typescript-eslint/no-inferrable-types': [
      2,
      {
        ignoreParameters: true,
        ignoreProperties: true,
      },
    ],
    // JSDoc validation - using modern eslint-plugin-jsdoc
    'jsdoc/require-jsdoc': [
      'warn',
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
    'jsdoc/require-param-description': 'warn',
    'jsdoc/require-returns-description': 'off',
    'jsdoc/check-param-names': 'warn',
    'jsdoc/check-tag-names': 'warn',
    'jsdoc/check-types': 'warn',
  },
  globals: { Meteor: 'readonly', i18n: 'readonly' },
})
