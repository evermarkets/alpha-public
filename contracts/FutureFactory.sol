pragma solidity ^0.4.18;

import './EVRToken.sol';
import './Future.sol';
import './MarginProvider.sol';
import './oracles/CentralizedOracle.sol';
import './oracles/ExchangeRates.sol';

contract FutureFactory {
  mapping(bytes32 => Future) public futures;
  mapping(bytes32 => address) public margin_providers;
  EVRToken public evr;
  ExchangeRates public rates;

  function FutureFactory(EVRToken _evr, ExchangeRates _rates) public {
    evr = _evr;
    rates = _rates;
  }

  function create_future(bytes32 key, string name, uint expiration_timestamp,
    uint initial_margin_usd_wei, uint maintenance_margin_usd_wei, uint backstop_deposit_ratio_bp,
    uint fee_per_contract_usd_wei, uint multiplier_bp)
    public
  {

    var custodian = msg.sender;

    var oracle = new CentralizedOracle(custodian);

    var future = new Future(
      evr,
      name,
      expiration_timestamp,
      initial_margin_usd_wei,
      maintenance_margin_usd_wei,
      fee_per_contract_usd_wei,
      backstop_deposit_ratio_bp,
      oracle,
      custodian,
      rates,
      "USD",
      multiplier_bp
    );

    if (margin_providers['default'] == address(0)) {
      reset_default_margin_provider();
    }

    var default_margin_provider = MarginProvider(margin_providers['default']);
    default_margin_provider.add_future(
      future,
      initial_margin_usd_wei,
      maintenance_margin_usd_wei,
      0 // fee_per_contract_usd_wei
    );

    futures[key] = future;
  }

  function create_margin_provider(bytes32 mp_key)
    public
  {
    var custodian = msg.sender;

    var margin_provider = new MarginProvider(evr, custodian, rates, "USD");

    margin_providers[mp_key] = margin_provider;
  }

  function reset_default_margin_provider()
    public
  {
    // TODO(AustinC): any way to only allow this in a test context?
    margin_providers['default'] = new MarginProvider(evr, this, rates, "USD");
  }
}
