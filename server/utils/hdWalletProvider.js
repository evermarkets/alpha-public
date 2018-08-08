/* eslint-disable */

/*
  This is from https://github.com/trufflesuite/truffle-hdwallet-provider
  I've added suport for a single private key rather than a mnemonic.
*/

var bip39 = require("bip39");
var hdkey = require('ethereumjs-wallet/hdkey');
var Wallet = require('ethereumjs-wallet');
var ProviderEngine = require("web3-provider-engine");
var FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js');
var HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var Web3 = require("web3");
var Transaction = require('ethereumjs-tx');

function HDWalletProvider(addresses, private_keys, provider_url) {
  this.private_keys = {};
  this.address = addresses[0];
  this.addresses = addresses;

  for (const [idx, addr] of addresses.entries()) {
    this.private_keys[addr] = new Buffer(private_keys[idx], 'hex');
  }

  const tmp_private_keys = this.private_keys;
  const tmp_addresses = this.addresses;

  this.engine = new ProviderEngine();
  this.engine.addProvider(new HookedSubprovider({
    getAccounts: function(cb) { cb(null, tmp_addresses) },
    getPrivateKey: function(address, cb) {
      if (!tmp_private_keys[address]) { return cb('Account not found'); }
      else { cb(null, tmp_private_keys[address].toString('hex')); }
    },
    signTransaction: function(txParams, cb) {
      let pkey;
      if (tmp_private_keys[txParams.from]) { pkey = tmp_private_keys[txParams.from]; }
      else { cb('Account not found'); }
      var tx = new Transaction(txParams);
      tx.sign(pkey);
      var rawTx = '0x' + tx.serialize().toString('hex');
      cb(null, rawTx);
    }
  }));
  this.engine.addProvider(new FiltersSubprovider());
  this.engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(provider_url)));
  this.engine.start(); // Required by the provider engine.
};

HDWalletProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

HDWalletProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

// returns the address of the given address_index, first checking the cache
HDWalletProvider.prototype.getAddress = function(idx) {
  if (!idx) { return this.address; }
  else { return null; }
}

// returns the addresses cache
HDWalletProvider.prototype.getAddresses = function() {
  return [this.address];
}

module.exports = HDWalletProvider;
