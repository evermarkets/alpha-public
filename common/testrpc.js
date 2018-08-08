const { spawn } = require('child_process');

const pad = (num, size) => {
  let s = `${num}`;
  while (s.length < size) s = `0${s}`;
  return s;
};

const processTestRPCOutput = (testRPCProcess, onStart) => {
  testRPCProcess.stdout.on('data', (data) => {
    console.log(`${data}`);

    if (data.includes('Listening on')) {
      if (onStart) onStart();
    }
  });

  testRPCProcess.stderr.on('data', data => console.log(`stderr: ${data}`));
  testRPCProcess.on('error', () => console.log('Failed to start TestRPC process.'));
  testRPCProcess.on('close', code => console.log(`TestRPC process exited with code ${code}`));
};

module.exports = {
  spawn: (numAccounts, startingBalance, onStart) => {
    const acctDefs = [];
    for (let i = 0; i < numAccounts; ++i) {
      const pk = `0x${pad(i + 1000, 64)}`;
      acctDefs[i] = `--account=${pk},${startingBalance}${pad(0, 18)}`;
      console.log(i, acctDefs[i]);
    }
    const argv = [
      '--hostname=0.0.0.0',
      '--gaslimit=6712390', // current mainnet gas limit
    ].concat(acctDefs);
    const testRPCProcess = spawn('ganache-cli', argv);
    processTestRPCOutput(testRPCProcess, onStart);
    return testRPCProcess;
  },
};
