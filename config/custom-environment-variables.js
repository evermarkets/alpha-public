
module.exports = {
  NODE_ENV: 'NODE_ENV',
  DEBUG: 'DEBUG',
  server: {
    port: 'PORT',
  },
  database: {
    host: 'MYSQL_HOST',
    name: 'MYSQL_DATABASE',
    username: 'MYSQL_USER',
    password: 'MYSQL_PASSWORD',
  },
  web3_provider: {
    host: 'TESTRPC_HOST',
    num_accounts: 'NUM_ACCOUNTS',
    starting_balance: 'STARTING_BALANCE',
  },
  logs: {
    logLevel: 'LOG_LEVEL',
    path: 'LOG_FILE',
    logConsoleLevel: 'LOG_CONSOLE_LEVEL',
  },
};
