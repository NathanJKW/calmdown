const path = require('path');

module.exports = {
  entry: {
    'tasks-webview': './src/calmdown/src/web/tasks/webview-main.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/webview'),
    filename: '[name].js'
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};