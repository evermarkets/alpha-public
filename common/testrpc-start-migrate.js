const { spawn } = require('child_process');
const config = require('config');
const testrpc = require('./testrpc');

const processMigrateOutput = (migrateProcess) => {
  migrateProcess.stderr.on('data', data => console.log(`stderr: ${data}`));
  migrateProcess.on('error', () => console.log('Failed to start migrate process.'));
  migrateProcess.on('close', (code) => {
    if (code === 0) console.log('Migration complete');
  });
};

const migrate = () => {
  console.log('Migrating contracts...');
  const migrateProcess = spawn('truffle', ['migrate', '--reset']);
  processMigrateOutput(migrateProcess);
};

if (config.isProduction) {
  console.log('Truffle migrations are not permitted for production environments.');
  process.exit();
}

testrpc.spawn(config.web3_provider.num_accounts, config.web3_provider.starting_balance, migrate);
