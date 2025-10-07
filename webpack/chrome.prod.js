const base = require('./base')

const TerserPlugin = require('terser-webpack-plugin')

module.exports = base('chrome', {
  mode: 'production',

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false, // don't remove console.*
            pure_funcs: [], // clear default pure function list
          },
          mangle: {
            reserved: ['console'], // don't rename console
          },
          format: {
            comments: false,
          },
          keep_fnames: true,
          safari10: true,
        },
      }),
    ],
  },
})
