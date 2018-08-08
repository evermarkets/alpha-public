
/* eslint-env node */

// Webpack config for PRODUCTION and DEVELOPMENT modes.
// Changes needed if used for devserver mode.

const webpack = require('webpack');
const rucksack = require('rucksack-css');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const envalid = require('envalid');
const path = require('path');

// Validate environment variables
validateEnvironmentVariables();

const config = require('config');

if (config.NODE_ENV === 'devserver') {
  throw new Error('This webpack config does not work as is with the web-dev-server.');
}

const { isProduction } = config;

const outputPublicPaths = {
  production: '/dist/',
  development: '/dist/',
  devserver: 'http://localhost:8080/', // we don't use this config for webpack-dev-server
};

console.log(`----- ${config.NODE_ENV.toUpperCase()} build.`);

// Base Webpack configuration
const webpackConfig = {
  context: path.join(__dirname, 'client'),
  // re devtool: http://cheng.logdown.com/posts/2016/03/25/679045
  devtool: isProduction ? 'cheap-module-source-map' : 'source-map',
  entry: {
    main: ['./index.js'],
  },
  output: {
    filename: '[name].bundle.[chunkhash].js',
    // Tell Webpack where it should store the resulting code.
    path: path.join(__dirname, 'public', 'dist'),
    // Give Webpack the URL that points the server to output.path
    publicPath: outputPublicPaths[config.NODE_ENV],
  },
  module: {
    loaders: [
      {
        // File index.html is created by html-webpack-plugin. It should be a file webpack processes.
        test: /\.html$/,
        loader: 'file?name=[name].[ext]',
      },
      {
        // When require'd, these /client/../*.inject.css files are injected into the DOM as is.
        test: /\.inject\.css$/,
        include: /client/,
        loader: 'style!css',
      },
      {
        // When required, the class names in these /client/../*.css are returned as an object.
        // after being made unique. The css with the modified class names is injected into the DOM.
        test: /^(?!.*\.inject\.css).*\.css$/,
        include: /client/,
        loaders: [
          'style-loader',
          'css-loader?modules&sourceMap&importLoaders=1&localIdentName=' +
          '[name]__[local]___[hash:base64:5]',
          'postcss-loader',
        ],
      },
      {
        // Standard processing for .css outside /client
        test: /\.css$/,
        exclude: /client/,
        loader: 'style!css',
      },
      {
        test: /\.(js|jsx)$/, // does anyone still use .jsx?
        exclude: /(node_modules|bower_components)/,
        loaders: [
          /*
          'react-hot',
          */
          'babel-loader',
        ],
      },
      {
        test: /\.json$/i,
        loader: 'json',
      },
    ],
  },
  resolve: {
    extensions: ['', '.js', '.jsx'],
    // Reroute import/require to specific files. 'react$' reroutes 'react' but not 'react/foo'.
    alias: {
    },
  },
  postcss: [
    rucksack({
      autoprefixer: true,
    }),
  ],
  plugins: [
    // Webpack's default file watcher does not work with NFS file systems on VMs,
    // definitely not with Oracle VM, and likely not with other VMs.
    // OldWatchingPlugin is a slower alternative that works everywhere.
    new webpack.OldWatchingPlugin(), // can use "webpack-dev-server --watch-poll" instead
    /*
     Build our HTML file.
     */
    // repeat new HtmlWebpackPlugin() for additional HTML files
    new HtmlWebpackPlugin({
      // Template based on https://github.com/jaketrent/html-webpack-template/blob/master/index.ejs
      template: path.join(process.cwd(), 'server', 'utils', 'index.ejs'),
      filename: 'index.html',
      inject: false, // important
      minify: {
        collapseWhitespace: true,
        conservativeCollapse: true,
        minifyCSS: true,
        minifyJS: true,
        preserveLineBreaks: true, // leave HTML readable
      },
      cache: false,
      /* We'd need this if we had a dynamically loaded user chunk
      excludeChunks: ['user'],
       */

      // Substitution values
      supportOldIE: false,
      meta: { description: config.client.appName },
      title: config.client.appName,
      faviconFile: '/favicon.png',
      mobile: false,
      links: [],
      baseHref: null,
      unsupportedBrowserSupport: false,
      appMountId: 'root',
      appMountIds: {},
      addRobotoFont: true, // See //www.google.com/fonts#UsePlace:use/Collection:Roboto:400,300,500
      copyWindowVars: {},
      scripts: ['/socket.io/socket.io.js'],
      devServer: false,
      googleAnalytics: false,
    }),
    // Define replacements for global constants in the client code.
    new webpack.DefinePlugin({
      'process.env': { NODE_ENV: JSON.stringify(config.NODE_ENV) }, // used by React, etc
      __processEnvNODE_ENV__: JSON.stringify(config.NODE_ENV), // used by us
    }),
  ],
};

// Production customization

if (isProduction) {
  webpackConfig.plugins.push(
    /*
     Besides the normal benefits, this is needed to minify React, Redux and React-Router
     for production if you choose not to use their run-time versions.
     */
    new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false },
      comments: false,
      sourceMap: false,
      mangle: true,
      minimize: true,
      verbose: false,
    }),
  );
}

module.exports = webpackConfig;

// Validate environment variables
function validateEnvironmentVariables() {
  const strPropType = envalid.str;

  // valid NODE_ENV values.
  const nodeEnv = {
    production: 'production',
    prod: 'production',
    development: 'development',
    dev: 'development',
    devserver: 'devserver',
    testing: 'devserver',
    test: 'devserver',
  };

  const cleanEnv = envalid.cleanEnv(process.env,
    {
      NODE_ENV: strPropType({
        choices: Object.keys(nodeEnv),
        default: 'developmwent',
        desc: 'processing environment',
      }),
    },
  );

  process.env.NODE_ENV = nodeEnv[cleanEnv.NODE_ENV];
}
