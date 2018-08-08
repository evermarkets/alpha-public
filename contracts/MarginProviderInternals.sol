pragma solidity ^0.4.18;

import './BaseFuture.sol';
import './EVRToken.sol';
import './Future.sol';
import './oracles/ExchangeRates.sol';

library MarginProviderInternals {

  using BaseFuture for BaseFuture.Data;

  struct Data {
    EVRToken evr;
    address lender;
    int lender_balance_evr_wei;
    uint fee_balance_evr_wei;
    Future[] futures;
    mapping(address => bool) in_futures_list;
    mapping(address => BaseFuture.Data) future_wrappers;
    address[] traders;
    mapping(address => bool) in_traders_list;
    mapping(address => int) trader_balances_evr_wei;
    ExchangeRates exchange_rates;
    bytes32 currency_code;
  }

  struct TryAddTradesParams {
    Future future;
    uint evr_per_usd_wei;
    uint trade_price_usd_wei;
    address[] traders;
    int[] sizes_atto;
    bool pay_fees;
  }

  struct TryAddTradesResult {
    bool can_add_trades;
    int net_position_change_atto;
    uint fee_volume_atto;
    int open_contracts_delta_atto;
    bytes32 error_message;
  }

  struct TryTopUpDepositOnFutureParams {
    Future future;
    uint evr_per_usd_wei;
    uint trade_price_usd_wei;
    int net_position_change_atto;
    uint fee_volume_atto;
  }

  /*
   *  Public functions
   */
  function add_future(Data storage self, Future future, uint initial_margin_usd_wei,
    uint maintenance_margin_usd_wei, uint fee_per_contract_usd_wei)
    public
  {
    require(!self.in_futures_list[future]);

    self.future_wrappers[future].evr = self.evr;
    self.future_wrappers[future].params = BaseFuture.Parameters(
      initial_margin_usd_wei,
      maintenance_margin_usd_wei,
      fee_per_contract_usd_wei
    );

    self.futures.push(future);
    self.in_futures_list[future] = true;
  }

  function try_add_trades(Data storage self, Future future, uint evr_per_usd_wei,
    uint trade_price_usd_wei, address[] traders, int[] sizes_atto, bool pay_fees)
    public
    returns (bool, int, uint, int, bytes32)
  {
    var result = try_add_trades_internal(
      self,
      TryAddTradesParams(future, evr_per_usd_wei, trade_price_usd_wei, traders, sizes_atto,
        pay_fees)
    );
    return (result.can_add_trades, result.net_position_change_atto, result.fee_volume_atto,
      result.open_contracts_delta_atto, result.error_message);
  }

  function top_up_deposit_on_future(Data storage self, Future future)
    public
  {
    bool can_top_up;
    bytes32 top_up_error_message;
    (can_top_up, top_up_error_message) = try_top_up_deposit_on_future(
      self,
      TryTopUpDepositOnFutureParams(future, get_current_exchange_rate(self),
        future.get_current_price_usd_wei(), 0, 0)
    );
    require(can_top_up);
  }

  function try_settle(Data storage self, Future future, uint evr_per_usd_wei,
    uint settlement_price_usd_wei)
    public
    returns (bool, int, int, bytes32)
  {
    TryAddTradesResult memory res = try_settle_internal(self, future, evr_per_usd_wei,
      settlement_price_usd_wei);
    return (res.can_add_trades, res.net_position_change_atto, res.open_contracts_delta_atto,
      res.error_message);
  }

  // TODO(rogs): update open interest on the future. If the lender already had an open position
  // opposite the one they're being assigned, then the open interest would go down.
  function mark_position(Data storage self, Future future, uint evr_per_usd_wei,
    uint marking_price_usd_wei, address trader)
    public
    returns (bytes32 error_message)
  {
    self.future_wrappers[future].add_trader(self.lender);

    BaseFuture.ComputeMarkPositionResult memory result =
      self.future_wrappers[future].compute_mark_position(evr_per_usd_wei, marking_price_usd_wei,
        trader, self.trader_balances_evr_wei[trader], self.lender);

    if (result.need_to_reassign) {
      if (!result.can_add_trades)
        return result.error_message;
      require(result.can_add_trades);
      assert(result.net_position_change_atto == 0);

      int new_available_funds_for_lender_as_trader_usd_wei =
        get_available_funds_after_trade_usd_wei(self, self.lender, future, evr_per_usd_wei,
          marking_price_usd_wei, result.new_trader_balances[1]);

      if (new_available_funds_for_lender_as_trader_usd_wei < 0) {
        uint amount_to_transfer_evr_wei = uint(
          Utils.to_evr_wei(evr_per_usd_wei, -new_available_funds_for_lender_as_trader_usd_wei)
        );

        if (self.lender_balance_evr_wei < int(amount_to_transfer_evr_wei))
          return "not enough lender deposit";

        // Transfer from the lender's general balance, to their deposit balance as a trader.
        self.lender_balance_evr_wei -= int(amount_to_transfer_evr_wei);
        self.trader_balances_evr_wei[self.lender] += int(amount_to_transfer_evr_wei);
      }

      self.future_wrappers[future].update_balances(result.traders, result.new_trader_balances,
        result.open_contracts_delta_atto);
    }
    return "";
  }

  function set_margin(Data storage self, Future future, uint initial_margin_usd_wei,
    uint maintenance_margin_usd_wei)
    public
  {
    require(initial_margin_usd_wei >= maintenance_margin_usd_wei);
    self.future_wrappers[future].params.initial_margin_usd_wei = initial_margin_usd_wei;
    self.future_wrappers[future].params.maintenance_margin_usd_wei = maintenance_margin_usd_wei;
  }

  /*
   *  Public read-only functions
   */
  function get_available_lender_funds_usd_wei(Data storage self, uint evr_per_usd_wei)
    public
    view
    returns (int)
  {
    int[] memory zeros = new int[](self.futures.length);
    return get_available_lender_funds_usd_wei_internal(self, evr_per_usd_wei, zeros);
  }

  function get_net_liquidation_value_usd_wei(Data storage self, address trader,
    uint evr_per_usd_wei)
    public
    view
    returns (int)
  {
    int net_liquidation_value_usd_wei = Utils.to_usd_wei(evr_per_usd_wei,
      self.trader_balances_evr_wei[trader]);
    for (uint i = 0; i < self.futures.length; ++i) {
      net_liquidation_value_usd_wei +=
        self.future_wrappers[self.futures[i]].get_net_liquidation_value_usd_wei(trader,
          evr_per_usd_wei,
          self.futures[i].get_current_price_usd_wei());
    }
    return net_liquidation_value_usd_wei;
  }

  function get_current_exchange_rate(Data storage self)
    public
    view
    returns (uint)
  {
    return self.exchange_rates.rates(self.currency_code);
  }

  /*
   *  Internal functions
   */
  // TODO(rogs): Factor out common add_trader for this and BaseFuture?
  function add_trader(Data storage self, address t)
    internal
  {
    if (self.in_traders_list[t]) {
      return;
    }

    self.traders.push(t);
    self.in_traders_list[t] = true;
  }

  function try_add_trades_internal(Data storage self, TryAddTradesParams _)
    internal
    returns (TryAddTradesResult res)
  {
    for (uint i = 0; i < _.traders.length; ++i)
      if (self.in_traders_list[_.traders[i]])
        self.future_wrappers[_.future].add_trader(_.traders[i]);

    var compute_result = self.future_wrappers[_.future].compute_add_trades_with_custom_fee(
      _.evr_per_usd_wei,
      _.trade_price_usd_wei,
      _.traders,
      _.sizes_atto,
      false,
      false,
      (_.pay_fees ? get_total_fee_per_contract_usd_wei(self, _.future) : 0)
    );
    if (!compute_result.can_add_trades) {
      res.error_message = compute_result.error_message;
      return res;
    }
    assert(compute_result.net_position_change_atto == Utils.sum_ints(_.sizes_atto));

    // Make sure each trader has enough funds available (sum of deposit + nlv on each future).
    for (i = 0; i < _.traders.length; ++i) {
      int new_available_funds_usd_wei = get_available_funds_after_trade_usd_wei(self, _.traders[i],
        _.future, _.evr_per_usd_wei, _.trade_price_usd_wei, compute_result.new_trader_balances[i]);

      if (new_available_funds_usd_wei < 0) {
        res.error_message = "not enough trader deposit";
        return res;
      }
    }

    // Now we check that the lender has enough deposited.
    int lender_funds_available_usd_wei = get_available_lender_funds_after_trades_usd_wei(self,
      _.future, _.evr_per_usd_wei, compute_result.open_contracts_delta_atto);
    if (lender_funds_available_usd_wei < 0) {
      res.can_add_trades = false;
      res.error_message = "not enough lender deposit";
      return res;
    }

    (res.can_add_trades, res.error_message) = try_top_up_deposit_on_future(
      self,
      TryTopUpDepositOnFutureParams(
        _.future,
        _.evr_per_usd_wei,
        _.trade_price_usd_wei,
        compute_result.net_position_change_atto,
        _.pay_fees ? compute_result.fee_volume_atto : 0
      )
    );
    if (!res.can_add_trades)
      return res;

    // calculate margin provider fees
    if (_.pay_fees)
      self.future_wrappers[_.future].state.fee_balance_evr_wei +=
        uint(Utils.to_evr_wei(_.evr_per_usd_wei, int((compute_result.fee_volume_atto *
          self.future_wrappers[_.future].params.fee_per_contract_usd_wei) / 1e18)));

    // Once we're sure that adding trades on the future will succeed, update the balances locally.
    self.future_wrappers[_.future].update_balances(_.traders,
      compute_result.new_trader_balances, compute_result.open_contracts_delta_atto);

    // TODO(rogs): would like to check_balances() here, but the future won't be updated yet.
    // Could implement a check_balances_after_trades() function that swaps in the computed balance
    // just for _.future.

    return TryAddTradesResult(true, compute_result.net_position_change_atto,
      compute_result.fee_volume_atto, compute_result.open_contracts_delta_atto, "");
  }

  function try_top_up_deposit_on_future(Data storage self, TryTopUpDepositOnFutureParams _)
    internal
    returns (bool, bytes32)
  {
    int new_contract_balance_atto = _.future.get_contract_balance_atto(this) +
      _.net_position_change_atto;
    int new_cost_balance_usd_wei = _.future.get_cost_balance_usd_wei(this) +
      FL.get_exposure_usd_wei(_.trade_price_usd_wei, _.net_position_change_atto);

    uint fee_for_future_evr_wei = uint(Utils.to_evr_wei(_.evr_per_usd_wei,
      int((_.fee_volume_atto * _.future.get_fee_per_contract_usd_wei()) / 1e18)));
    var new_balance = FL.TraderBalance(
      new_contract_balance_atto,
      new_cost_balance_usd_wei,
      _.future.get_deposit_balance_evr_wei(this) - int(fee_for_future_evr_wei)
    );

    int new_available_funds_usd_wei =
      FL.get_excess_margin_usd_wei(_.evr_per_usd_wei, _.trade_price_usd_wei, new_balance,
        _.future.get_initial_margin_usd_wei());

    if (new_available_funds_usd_wei < 0) {
      uint amount_to_deposit_evr_wei =
        uint(Utils.to_evr_wei(_.evr_per_usd_wei, -new_available_funds_usd_wei));

      if (self.evr.balanceOf(this) < amount_to_deposit_evr_wei)
        return (false, "not enough EVR to top-up");
      if (!self.evr.approve(address(_.future), amount_to_deposit_evr_wei))
        return (false, "cannot approve top-up");

      _.future.deposit(this, amount_to_deposit_evr_wei);
    }
    return (true, "");
  }

  function try_settle_internal(Data storage self, Future future, uint evr_per_usd_wei,
    uint settlement_price_usd_wei)
    internal
    returns (MarginProviderInternals.TryAddTradesResult)
  {
    // Close out each trader's position.
    uint num_open_positions = 0;
    for (uint i = 0; i < self.future_wrappers[future].state.traders.length; ++i) {
      if (self.future_wrappers[future].state
          .trader_balances[self.future_wrappers[future].state.traders[i]]
          .contract_balance_atto != 0) {
        num_open_positions++;
      }
    }
    if (num_open_positions == 0)
      return MarginProviderInternals.TryAddTradesResult(true, 0, 0, 0, "");

    address[] memory traders_to_close = new address[](num_open_positions);
    int[] memory sizes_atto = new int[](num_open_positions);
    uint j = 0;
    for (i = 0; i < self.future_wrappers[future].state.traders.length; ++i) {
      address t = self.future_wrappers[future].state.traders[i];
      if (self.future_wrappers[future].state.trader_balances[t].contract_balance_atto != 0) {
        traders_to_close[j] = t;
        sizes_atto[j] =
          -self.future_wrappers[future].state.trader_balances[t].contract_balance_atto;
        j++;
      }
    }

    return try_add_trades_internal(
      self,
      MarginProviderInternals.TryAddTradesParams(future, evr_per_usd_wei, settlement_price_usd_wei,
        traders_to_close, sizes_atto, false)
    );
  }

  /*
   *  Internal read-only functions
   */
  function get_total_fee_per_contract_usd_wei(Data storage self, Future future)
    internal
    view
    returns (uint)
  {
    // total fee to charge traders is sum of margin provider and contract creator fees
    return self.future_wrappers[future].params.fee_per_contract_usd_wei +
      future.get_fee_per_contract_usd_wei();
  }

  function get_available_funds_after_trade_usd_wei(Data storage self, address trader, Future future,
    uint evr_per_usd_wei, uint trade_price_usd_wei, FL.TraderBalance new_balance)
    internal
    view
    returns (int)
  {
    int available_funds_usd_wei =
      Utils.to_usd_wei(evr_per_usd_wei, self.trader_balances_evr_wei[trader]);
    for (uint i = 0; i < self.futures.length; ++i) {
      if (self.futures[i] == future) {
        available_funds_usd_wei += FL.get_excess_margin_usd_wei(evr_per_usd_wei,
          trade_price_usd_wei, new_balance, self.future_wrappers[future].get_initial_margin_usd_wei());
      } else {
        available_funds_usd_wei +=
          self.future_wrappers[self.futures[i]].get_available_funds_usd_wei(trader,
            evr_per_usd_wei, self.futures[i].get_current_price_usd_wei());
      }
    }
    return available_funds_usd_wei;
  }

  function get_available_lender_funds_after_trades_usd_wei(Data storage self, Future future,
    uint evr_per_usd_wei, int open_contracts_delta_atto)
    internal
    view
    returns (int)
  {
    int[] memory deltas = new int[](self.futures.length);
    for (uint i = 0; i < self.futures.length; ++i) {
      if (self.futures[i] == future) {
        deltas[i] = open_contracts_delta_atto;
      }
    }

    return get_available_lender_funds_usd_wei_internal(self, evr_per_usd_wei, deltas);
  }

  function get_available_lender_funds_usd_wei_internal(Data storage self, uint evr_per_usd_wei,
    int[] open_contracts_deltas_atto)
    internal
    view
    returns (int)
  {
    assert(open_contracts_deltas_atto.length == self.futures.length);

    uint total_deposit_required_usd_wei = 0;
    for (uint i = 0; i < self.futures.length; ++i) {
      Future future = self.futures[i];

      int new_open_contracts_atto = int(self.future_wrappers[future].state.open_contracts_atto)
        + open_contracts_deltas_atto[i];
      // Can't close more positions than were open.
      assert(new_open_contracts_atto >= 0);

      total_deposit_required_usd_wei +=
        get_initial_margin_required_from_lender_usd_wei(self, future,
          uint(new_open_contracts_atto));
    }

    return Utils.to_usd_wei(evr_per_usd_wei, self.lender_balance_evr_wei) -
      int(total_deposit_required_usd_wei);
  }

  function get_initial_margin_required_from_lender_usd_wei(Data storage self, Future future,
    uint open_contracts_atto)
    internal
    view
    returns (uint)
  {
    uint required_by_future_usd_wei =
      get_initial_margin_required_by_future_usd_wei(future, open_contracts_atto);
    uint required_from_traders_usd_wei =
      get_initial_margin_required_from_traders_usd_wei(self, future, open_contracts_atto);
    // We should be requiring *less* from traders than the future requires.
    assert(required_by_future_usd_wei >= required_from_traders_usd_wei);
    return required_by_future_usd_wei - required_from_traders_usd_wei;
  }

  function get_initial_margin_required_by_future_usd_wei(Future future, uint open_contracts_atto)
    internal
    view
    returns (uint)
  {
    return FL.get_margin_required_usd_wei(int(open_contracts_atto),
      future.get_initial_margin_usd_wei());
  }

  function get_initial_margin_required_from_traders_usd_wei(Data storage self, Future future,
    uint open_contracts_atto)
    internal
    view
    returns (uint)
  {
    return FL.get_margin_required_usd_wei(int(open_contracts_atto),
      self.future_wrappers[future].params.initial_margin_usd_wei);
  }
}
