/* Great idea from Gnosis (https://github.com/gnosis/gnosis-contracts). */

const fs = require('fs-extra');
const path = require('path');

const dir = path.join('build', 'contracts');
const dirFiles = fs.readdirSync(dir);

async function injectNetworks() {
  const contractNetworks = JSON.parse(fs.readFileSync('networks.json'));

  contractNetworks
    .map(([name, networks]) => [path.join(dir, `${name}.json`), networks])
    .filter(([file, _]) => {
      // check for missing contract json files
      if (!fs.existsSync(file))
        throw new Error(`Cannot inject into missing file ${file}. Try 'npm run compile' first.`);
      return true;
    })
    .forEach(([file, networks]) => {
      // merge existing network key with networks.json
      const data = JSON.parse(fs.readFileSync(file));
      data.networks = { ...data.networks, ...networks };
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    });
}

injectNetworks();
