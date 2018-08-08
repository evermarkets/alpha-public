const FutureFactory = artifacts.require('../contracts/FutureFactory.sol');
const Future = artifacts.require('../contracts/Future.sol');

const productName = 'ESM2018';

function receivePrintString(args) {
  console.log(args.s);
}

function receivePrintInt(args) {
  console.log(`${args.label}: ${args.value}`);
}

function watchHelper(callback) {
  return (err, result) => {
    if (err)
      console.log('Error!', err);
    if (result)
      callback(result.args);
  };
}

function main(done) {
  FutureFactory.deployed()
    .then(ff => {
      return ff.futures(productName);
    })
    .then(addr => {
      return Future.at(addr);
    })
    .then(f => {
      console.log(`Connected to Future('${productName}') @ ${f.address}`)
      f.PrintString().watch(watchHelper(receivePrintString));
      f.PrintInt().watch(watchHelper(receivePrintInt));
      f.PrintUInt().watch(watchHelper(receivePrintInt));
    });

    done();
}

module.exports = main;
