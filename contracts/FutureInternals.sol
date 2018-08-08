pragma solidity ^0.4.18;

// WARNING: the int() casts below are not safe for very large uints
// TODO(rogs): does using uint128 solve the problem? Or should we use the SafeMath library?

import './BaseFuture.sol';
import './Future.sol';
import './MarginProvider.sol';
import './oracles/ExchangeRates.sol';
import './oracles/Oracle.sol';

library FutureInternals {

  using BaseFuture for BaseFuture.Data;

  struct Data {
    Future future;
    BaseFuture.Data base;
    Oracle oracle;
    bool expired;
    bool settled;
    uint last_trade_price_usd_wei;
    uint settlement_price_usd_wei;
    uint backstop_deposit_ratio_bp;
    uint backstop_deposit_balance_evr_wei;
    uint open_interest_atto;
    address custodian;
    ExchangeRates exchange_rates;
    bytes32 currency_code;
    uint multiplier_bp;
  }

  function try_add_trades_with_margin_providers(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei, address[] margin_providers, uint[] mp_trader_pair_counts,
    address[] traders, int[] sizes_atto)
    public
    returns (bool, bytes32)
  {
    if (margin_providers.length != mp_trader_pair_counts.length)
      return (false, "mp array length mismatch");
    if (Utils.sum_uints(mp_trader_pair_counts) != traders.length)
      return (false, "trader array length mismatch");

    bool can_add_trades;
    bytes32 error_message;

    MarginProviderInternals.TryAddTradesResult[] memory mp_results;
    (can_add_trades, mp_results, error_message) =
      try_add_trades_to_margin_providers(self, evr_per_usd_wei, trade_price_usd_wei,
        margin_providers, mp_trader_pair_counts, traders, sizes_atto);
    if (!can_add_trades)
      return (false, error_message);

    (can_add_trades, error_message) = try_update_open_interest(self, mp_results, true);
    if (!can_add_trades)
      return (false, error_message);

    take_fees(self, evr_per_usd_wei, margin_providers, mp_results);

    int[] memory new_sizes_atto = new int[](mp_results.length);
    bool all_netted_to_zero = true;
    for (uint i = 0; i < mp_results.length; ++i) {

      new_sizes_atto[i] = mp_results[i].net_position_change_atto;
      if (mp_results[i].net_position_change_atto != 0)
        all_netted_to_zero = false;

      // we may not be adding trades, but we still need to add this margin
      // provider to the traders collection for settle()
      self.base.add_trader(margin_providers[i]);
    }

    // If the margin providers have had no net position changes, then we don't need to call
    // try_add_trades_internal(), but we do want to still update the trade price.
    if (all_netted_to_zero) {
      update_last_trade_price(self, trade_price_usd_wei);
      return (true, "");
    }

    return try_add_trades_internal(self, evr_per_usd_wei, trade_price_usd_wei, margin_providers,
      new_sizes_atto);
  }

  // Update the open interest amount, and check that the backstop deposit is sufficient.
  function try_update_open_interest(Data storage self,
    MarginProviderInternals.TryAddTradesResult[] mp_results, bool check_backstop)
    internal
    returns (bool, bytes32)
  {
    int new_open_contracts_atto = int(2 * self.open_interest_atto);
    for (uint i = 0; i < mp_results.length; ++i) {
      // Track the size of all open positions.
      new_open_contracts_atto += mp_results[i].open_contracts_delta_atto;
    }

    // Shouldn't have gotten into a state where we think we're closing out more volume than is open.
    assert(new_open_contracts_atto >= 0);

    // There should be a long for every short.
    if (new_open_contracts_atto % 2 != 0)
      return (false, "long short mismatch");

    uint new_open_interest_atto = uint(new_open_contracts_atto / 2);
    if (check_backstop && self.backstop_deposit_balance_evr_wei <
      get_backstop_deposit_required_usd_wei(self, new_open_interest_atto))
      return (false, "not enough backstop");

    self.open_interest_atto = new_open_interest_atto;
    return (true, "");
  }

  function try_add_trades_to_margin_providers(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei, address[] margin_providers, uint[] mp_trader_pair_counts,
    address[] traders, int[] sizes_atto)
    internal
    returns (bool, MarginProviderInternals.TryAddTradesResult[], bytes32)
  {
    MarginProviderInternals.TryAddTradesResult[] memory results =
      new MarginProviderInternals.TryAddTradesResult[](margin_providers.length);

    uint offset = 0;
    for (uint i = 0; i < margin_providers.length; ++i) {
      uint next_offset = offset + mp_trader_pair_counts[i];

      (results[i].can_add_trades,
        results[i].net_position_change_atto,
        results[i].fee_volume_atto,
        results[i].open_contracts_delta_atto,
        results[i].error_message) =
        MarginProvider(margin_providers[i]).try_add_trades(
          self.future,
          evr_per_usd_wei,
          trade_price_usd_wei,
          Utils.slice_addresses(traders, offset, next_offset),
          Utils.slice_ints(sizes_atto, offset, next_offset),
          true);
      if (!results[i].can_add_trades)
        return (false, new MarginProviderInternals.TryAddTradesResult[](0),
          results[i].error_message);

      offset = next_offset;
    }

    return (true, results, "");
  }

  function try_add_trades_internal(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei, address[] traders, int[] sizes_atto)
    public
    returns (bool, bytes32)
  {
    var result = self.base.compute_add_trades_with_custom_fee(evr_per_usd_wei, trade_price_usd_wei,
      traders, sizes_atto, true, true, 0);
    if (!result.can_add_trades)
      return (false, result.error_message);
    require(result.can_add_trades);
    assert(result.net_position_change_atto == 0);

    self.base.update_balances(traders, result.new_trader_balances,
      result.open_contracts_delta_atto);
    update_last_trade_price(self, trade_price_usd_wei);

    if (!check_balances(self, evr_per_usd_wei, trade_price_usd_wei))
      return (false, "low EVR balance");

    return (true, "");
  }

  function update_last_trade_price(Data storage self, uint trade_price_usd_wei)
    internal
  {
    // TODO(rogs): make sure we never try to look up an out-of-date last_trade_price_usd_wei
    // while doing the above processing!
    self.last_trade_price_usd_wei = trade_price_usd_wei;
  }

  function take_fees(Data storage self, uint evr_per_usd_wei, address[] margin_providers,
    MarginProviderInternals.TryAddTradesResult[] mp_results)
    internal
  {
    for (uint i = 0; i < mp_results.length; ++i) {

      // calculate contract creator fees
      uint fee_evr_wei = uint(Utils.to_evr_wei(evr_per_usd_wei,
        int((mp_results[i].fee_volume_atto * self.base.params.fee_per_contract_usd_wei) / 1e18)));
      self.base.state.fee_balance_evr_wei += fee_evr_wei;

      // take fees from margin provider
      self.base.state.trader_balances[margin_providers[i]].deposit_balance_evr_wei -=
        int(fee_evr_wei);
    }
  }

  function settle(Data storage self, uint evr_per_usd_wei)
    public
  {
    require(self.expired);
    require(!self.settled);

    require(self.oracle.isOutcomeSet());
    int oracle_reported_price = self.oracle.getOutcome();

    require(oracle_reported_price >= 0);
    self.settlement_price_usd_wei = (self.multiplier_bp * uint(oracle_reported_price)) / 1e4;

    // Close out each margin provider's position.
    MarginProviderInternals.TryAddTradesResult[] memory mp_results =
      new MarginProviderInternals.TryAddTradesResult[](self.base.state.traders.length);
    for (uint i = 0; i < self.base.state.traders.length; ++i) {
      (mp_results[i].can_add_trades,
        mp_results[i].net_position_change_atto,
        mp_results[i].open_contracts_delta_atto,
        mp_results[i].error_message) =
        MarginProvider(self.base.state.traders[i]).try_settle(self.future, evr_per_usd_wei,
          self.settlement_price_usd_wei);
      assert(mp_results[i].can_add_trades);
    }

    // Update the open interest. Should go to zero.
    bool can_add_trades;
    bytes32 _;
    (can_add_trades, _) = try_update_open_interest(self, mp_results, false);
    assert(can_add_trades);
    assert(self.open_interest_atto == 0);

    // Get the new sizes.
    int[] memory new_sizes_atto = new int[](mp_results.length);
    bool all_netted_to_zero = true;
    for (i = 0; i < mp_results.length; ++i) {
      new_sizes_atto[i] = mp_results[i].net_position_change_atto;
      if (mp_results[i].net_position_change_atto != 0)
        all_netted_to_zero = false;
    }

    // If the margin providers have had no net position changes, then we don't need to call
    // try_add_trades_internal(), but we do want to still update the trade price.
    if (all_netted_to_zero) {
      update_last_trade_price(self, self.settlement_price_usd_wei);
    } else {
      // TODO(rogs): pay fees?
      (can_add_trades, _) = try_add_trades_internal(self, evr_per_usd_wei,
        self.settlement_price_usd_wei, self.base.state.traders, new_sizes_atto);
      assert(can_add_trades);

      // Withdraw all margin provider deposit from settled future so traders can withdraw.
      for (uint j = 0; j < self.base.state.traders.length; ++j) {
        MarginProvider(self.base.state.traders[j]).withdraw_excess_deposit_from_future(self.future);
        MarginProvider(self.base.state.traders[j]).pull_fees_from_future(self.future);
      }
    }

    self.settled = true;
  }

  function get_backstop_deposit_required_usd_wei(Data storage self, uint open_interest_atto)
    public
    view
    returns (uint)
  {
    uint total_maintenance_margin_requirements_usd_wei =
      FL.get_margin_required_usd_wei(int(2 * open_interest_atto),
        self.base.params.maintenance_margin_usd_wei);
    return total_maintenance_margin_requirements_usd_wei * self.backstop_deposit_ratio_bp / 1e4;
  }

  // TODO(rogs): update open interest?
  function mark_position(Data storage self, uint evr_per_usd_wei, uint marking_price_usd_wei,
    address trader)
    public
    returns (bool can_mark, bytes32 error_message)
  {
    self.base.add_trader(self.custodian);

    BaseFuture.ComputeMarkPositionResult memory result =
      self.base.compute_mark_position(evr_per_usd_wei, marking_price_usd_wei, trader, 0,
        self.custodian);

    if (result.need_to_reassign) {
      if (!result.can_add_trades)
        return (false, result.error_message);
      require(result.can_add_trades);
      assert(result.net_position_change_atto == 0);

      (can_mark, error_message) = top_up_custodian_deposit(self, evr_per_usd_wei,
        marking_price_usd_wei, result.new_trader_balances[1]);
      if (!can_mark)
        return (false, error_message);

      self.base.update_balances(result.traders, result.new_trader_balances,
        result.open_contracts_delta_atto);
    }

    update_last_trade_price(self, marking_price_usd_wei);
    return (true, "");
  }

  function set_margin(Data storage self, uint initial_margin_usd_wei,
    uint maintenance_margin_usd_wei)
    public
  {
    require(initial_margin_usd_wei >= maintenance_margin_usd_wei);
    self.base.params.initial_margin_usd_wei = initial_margin_usd_wei;
    self.base.params.maintenance_margin_usd_wei = maintenance_margin_usd_wei;
  }

  function top_up_custodian_deposit(Data storage self, uint evr_per_usd_wei,
    uint marking_price_usd_wei, FL.TraderBalance new_custodian_balance)
    internal
    returns (bool, bytes32)
  {
    int new_available_funds_usd_wei =
      FL.get_excess_margin_usd_wei(evr_per_usd_wei, marking_price_usd_wei, new_custodian_balance,
        self.base.params.initial_margin_usd_wei);

    if (new_available_funds_usd_wei < 0) {
      uint amount_evr_wei = uint(Utils.to_evr_wei(evr_per_usd_wei, -new_available_funds_usd_wei));

      if (self.backstop_deposit_balance_evr_wei < amount_evr_wei)
        return (false, "not enough backstop deposit");

      self.backstop_deposit_balance_evr_wei -= amount_evr_wei;
      new_custodian_balance.deposit_balance_evr_wei += int(amount_evr_wei);
    }
    return (true, "");
  }

  function get_total_balance_evr_wei(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei)
    internal
    view
    returns (int)
  {
    return int(self.backstop_deposit_balance_evr_wei) +
      self.base.get_total_balance_evr_wei(evr_per_usd_wei, trade_price_usd_wei);
  }

  function check_balances(Data storage self, uint evr_per_usd_wei, uint trade_price_usd_wei)
    public
    view
    returns (bool)
  {
    return int(self.base.evr.balanceOf(this)) >=
      get_total_balance_evr_wei(self, evr_per_usd_wei, trade_price_usd_wei);
  }

  function get_current_exchange_rate(Data storage self)
    public
    view
    returns (uint)
  {
    return self.exchange_rates.rates(self.currency_code);
  }

  function get_multiplier_bp(Data storage self)
    public
    view
    returns (uint)
  {
    return self.multiplier_bp;
  }
}
