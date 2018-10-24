/*
* Based on https://github.com/ccoenraets/react-trivia
* Published under MIT license
*/

var path = require('path');
var webpack = require('webpack');

module.exports = {
  entry: './js/app.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'app.bundle.js'
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
