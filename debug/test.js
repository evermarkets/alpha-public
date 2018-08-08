const FutureFactory = artifacts.require('../contracts/FutureFactory.sol');
const Future = artifacts.require('../contracts/Future.sol');
const EVRToken = artifacts.require('../contracts/EVRToken.sol');

const productName = 'ESM2018';

function main(done) {
  FutureFactory.deployed()
    .then(ff => {
      return ff.futures(productName);
    })
    .then(addr => {
      return Future.at(addr);
    })
    .then(f => {
      console.log(`Connected to Future('${productName}') @ ${f.address}`);
      f.product_name().then(console.log);

      // // add 10 more ether to user's deposit
      // f.deposit.sendTransaction('0x9b11740ea6d46b9176b1ebb69a1672be9c2c63d8', {
      //   from: '0x9b11740ea6d46b9176b1ebb69a1672be9c2c63d8',
      //   value: web3.toWei(10, 'ether'),
      //   gas: 100000
      // });

      // f.get_deposit_balance_evr_wei('0x9b11740ea6d46b9176b1ebb69a1672be9c2c63d8').then(console.log);

      return Promise.all([f, EVRToken.deployed()]);
    })
    .then(([f, evrToken]) => {
      depositForBackstop(web3, productName, 1, f, evrToken);
    });

  done();
}

function depositForBackstop(Web3, productName, valueEVR, f, evr) {
  const userAddr = Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  return Promise.all([evr.approve(f.address, valueWei), evr, f])
    .then(([, evr, f]) => f.deposit_for_backstop.sendTransaction(
      evr.address, valueWei, {
        from: userAddr,
        gas: 1000000,  // TODO(AustinC): update
      }));
}

module.exports = main;

/*
  For use in 'truffle console':
    FutureFactory.deployed().then(ff => ff.futures('ESM2018').then(addr => Future.at(addr).then(x => f = x)))
*/
