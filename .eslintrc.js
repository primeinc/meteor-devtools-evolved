const { merge } = require('lodash')

module.exports = merge(require('@tstt/eslint-config/index.js'), {
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
    // Require JSDoc comments for exported functions
    'require-jsdoc': [
      'warn',
      {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: false,
          ClassDeclaration: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      },
    ],
    // Validate JSDoc comments when present
    'valid-jsdoc': [
      'warn',
      {
        requireReturn: false,
        requireParamDescription: true,
        requireReturnDescription: false,
        prefer: {
          return: 'returns',
        },
      },
    ],
  },
  globals: { Meteor: 'readonly', i18n: 'readonly' },
})
