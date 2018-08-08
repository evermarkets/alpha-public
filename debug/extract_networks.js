/* Great idea from Gnosis (https://github.com/gnosis/gnosis-contracts). */

const fs = require('fs-extra');
const path = require('path');

async function extractNetworks() {
  const dir = path.join('build', 'contracts');
  const dirFiles = fs.readdirSync(dir);

  // get content of all contract JSON files
  const fnames = dirFiles.filter(fname => fname.endsWith('.json'));
  const nameContentPairs = await Promise.all(
      fnames.map(fname => fs.readFile(path.join(dir, fname)))
  );

  // extract 'networks' key of each file
  const nameNetworkPairs = Object.entries(nameContentPairs)
    .map(([idx, content]) => [fnames[idx].slice(0, -5), JSON.parse(content)['networks']])
    .filter(([fname, networks]) => (Object.keys(networks).length !== 0));

  // write all non-empty 'networks' keys to networks.js
  fs.writeFileSync('networks.json', JSON.stringify(nameNetworkPairs, null, 2));
}

extractNetworks();
