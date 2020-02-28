var path = require('path');
var webpack = require('webpack');

module.exports = {
  entry: './js/pageNotFound.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'pageNotFound.bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: "babel-loader"
      },
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: "babel-loader"
      }
    ]
  },
  stats: {
    colors: true
  },
  devtool: 'source-map'
};
