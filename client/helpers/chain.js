/* eslint no-undef: 0 */

const Web3 = require('web3');

const chain = require('../../common/chain');

function getWeb3() {
  if (typeof web3 === 'undefined')
    return null;

  return new Web3(web3.currentProvider);
}

// build a client-side web3 object and pass it to the common chain module
module.exports = {
  getWeb3,
  chain,
};
