pragma solidity ^0.4.18;

import './EVRToken.sol';
import './Utils.sol';

// FutureLibrary
library FL {
  // At expiration, each trader receives settlement_price * contract_balance - cost_balance.
  //
  // When a trader goes long, their contract_balance and cost_balance are both positive.
  // When a trader goes short, their contract_balance and cost_balance are both negative.
  //
  // For example, if Alice goes long 5 contracts at a price of 100k and Bob takes the other side:
  //     Alice's contract_balance is +5, and her cost_balance is +500k.
  //     Bob's contract_balance is -5, and his cost_balance is -500k.
  // If the contract expires at a price of 110k, and Alice and Bob both still hold their original
  // positions, then:
  //     Alice is owed 110k * 5 - 500k = 50k.
  //     Bob is owed 110k * (-5) - (-500k) = -50k.
  struct TraderBalance {
    int contract_balance_atto;
    int cost_balance_usd_wei;
    int deposit_balance_evr_wei;
  }

  // We use these structs internally so that we don't hit the local variable limit.
  struct ComputeAddTradesParams {
    uint evr_per_usd_wei;
    uint trade_price_usd_wei;
    int[] sizes_atto;
    TraderBalance[] trader_balances;
    uint fee_per_contract_usd_wei;
    uint initial_margin_usd_wei;
    bool sum_to_zero;
    bool require_initial_margin;
  }

  struct ComputeAddTradesResult {
    bool can_add_trades;
    TraderBalance[] new_trader_balances;
    uint fee_volume_atto;
    int net_position_change_atto;
    int open_contracts_delta_atto;
    bytes32 error_message;
  }

  struct ComputeTradeResult {
    bool can_add_trade;
    TraderBalance new_trader_balance;
    bytes32 error_message;
  }

  function compute_add_trades(ComputeAddTradesParams _)
    internal
    pure
    returns (ComputeAddTradesResult)
  {
    // The empty struct corresponds to failure (and will have can_add_trades set to false).
    ComputeAddTradesResult memory failure;
    bool passed_check;
    (passed_check, failure.error_message) =
      check_add_trades_params(_.trade_price_usd_wei, _.sizes_atto, _.trader_balances,
        _.sum_to_zero);
    if (!passed_check) {
      return failure;
    }

    TraderBalance[] memory new_trader_balances = new TraderBalance[](_.sizes_atto.length);
    uint fee_volume_atto = 0;
    int net_position_change_atto = 0;

    for (uint i = 0; i < _.sizes_atto.length; ++i) {
      var result = compute_trade(_.evr_per_usd_wei, _.trade_price_usd_wei, _.sizes_atto[i],
        _.trader_balances[i],
        _.initial_margin_usd_wei, _.fee_per_contract_usd_wei, _.require_initial_margin);
      if (!result.can_add_trade) {
        failure.error_message = result.error_message;
        return failure;
      }

      new_trader_balances[i].contract_balance_atto =
        result.new_trader_balance.contract_balance_atto;
      new_trader_balances[i].cost_balance_usd_wei =
        result.new_trader_balance.cost_balance_usd_wei;
      new_trader_balances[i].deposit_balance_evr_wei =
        result.new_trader_balance.deposit_balance_evr_wei;

      fee_volume_atto += Utils.abs(_.sizes_atto[i]);
      net_position_change_atto += _.sizes_atto[i];
    }

    return ComputeAddTradesResult(
      true,
      new_trader_balances,
      fee_volume_atto,
      net_position_change_atto,
      get_open_contracts_delta_atto(new_trader_balances, _.trader_balances),
      "");
  }

  function check_add_trades_params(uint trade_price_usd_wei, int[] sizes_atto,
    TraderBalance[] trader_balances, bool sum_to_zero)
    private
    pure
    returns (bool, bytes32)
  {
    if (trade_price_usd_wei <= 0)
      return (false, "trade_price_usd_wei <= 0");

    if (sizes_atto.length <= 0)
      return (false, "sizes_atto.length <= 0");

    if (trader_balances.length != sizes_atto.length)
      return (false, "balances.length != sizes.length");

    for (uint i = 0; i < sizes_atto.length; ++i)
      if (sizes_atto[i] == 0)
        return (false, "sizes_atto[i] == 0");

    if (sum_to_zero && Utils.sum_ints(sizes_atto) != 0) {
        return (false, "Utils.sum_ints(sizes_atto) != 0");
    }

    return (true, "");
  }

  function compute_trade(uint evr_per_usd_wei, uint trade_price_usd_wei, int size_atto,
    TraderBalance trader_balance, uint initial_margin_usd_wei, uint fee_per_contract_usd_wei,
    bool require_initial_margin)
    private
    pure
    returns (ComputeTradeResult)
  {
    int new_contract_balance_atto = trader_balance.contract_balance_atto + size_atto;

    int new_cost_balance_usd_wei;
    int realized_profit_evr_wei;

    // Opening a new position or increasing the size of an existing one.
    if (trader_balance.contract_balance_atto == 0 ||
      Utils.sign(size_atto) == Utils.sign(trader_balance.contract_balance_atto)) {
      new_cost_balance_usd_wei =
        compute_open_position(trade_price_usd_wei, size_atto, trader_balance.contract_balance_atto,
          trader_balance.cost_balance_usd_wei);
    }
    // Closing (part of) an existing position.
    else if (Utils.abs(size_atto) <= Utils.abs(trader_balance.contract_balance_atto)) {
      (new_cost_balance_usd_wei, realized_profit_evr_wei) =
        compute_close_position(evr_per_usd_wei, trade_price_usd_wei, size_atto,
          trader_balance.contract_balance_atto, trader_balance.cost_balance_usd_wei);
    }
    // Closing an entire position and opening a new one in the opposite direction.
    else /* (contract_balance_atto != 0 && Utils.abs(size_atto) >
      Utils.abs(contract_balance_atto)) */ {
      (new_cost_balance_usd_wei, realized_profit_evr_wei) =
        compute_close_position(evr_per_usd_wei, trade_price_usd_wei,
          -trader_balance.contract_balance_atto, trader_balance.contract_balance_atto,
          trader_balance.cost_balance_usd_wei);

      new_cost_balance_usd_wei =
        compute_open_position(trade_price_usd_wei, (size_atto +
          trader_balance.contract_balance_atto), 0,
          new_cost_balance_usd_wei);
    }

    // TODO(rogs): don't require fees when closing positions when the contract is under-backstopped?
    uint fee_evr_wei = compute_fee_evr_wei(evr_per_usd_wei, size_atto, fee_per_contract_usd_wei);
    int new_deposit_balance_evr_wei = trader_balance.deposit_balance_evr_wei - int(fee_evr_wei)
      + realized_profit_evr_wei;

    TraderBalance memory new_tb = TraderBalance(new_contract_balance_atto, new_cost_balance_usd_wei,
      new_deposit_balance_evr_wei);

    if (require_initial_margin &&
      get_excess_margin_usd_wei(evr_per_usd_wei, trade_price_usd_wei, new_tb, initial_margin_usd_wei)
      < 0) {
      return ComputeTradeResult(false, TraderBalance(0, 0, 0), "not enough margin");
    }

    return ComputeTradeResult(true, new_tb, "");
  }

  function compute_open_position(uint trade_price_usd_wei, int size_atto, int contract_balance_atto,
    int cost_balance_usd_wei)
    private
    pure
    returns (int)
  {
    assert(contract_balance_atto == 0 ||
      Utils.sign(size_atto) == Utils.sign(contract_balance_atto));

    int new_cost_balance_usd_wei = cost_balance_usd_wei + (size_atto * int(trade_price_usd_wei))
      / 1e18;
    return (new_cost_balance_usd_wei);
  }

  function compute_close_position(uint evr_per_usd_wei, uint trade_price_usd_wei, int size_atto,
    int contract_balance_atto, int cost_balance_usd_wei)
    private
    pure
    returns (int, int)
  {
    assert(contract_balance_atto != 0);
    assert(Utils.sign(size_atto) != Utils.sign(contract_balance_atto));
    assert(Utils.abs(size_atto) <= Utils.abs(contract_balance_atto));

    uint average_entry_price_usd_wei = get_average_entry_price_usd_wei(contract_balance_atto,
      cost_balance_usd_wei);
    // TODO(rogs): assert(average_entry_price_usd_wei > 0) ?
    int new_cost_balance_usd_wei = cost_balance_usd_wei
      + ((size_atto * int(average_entry_price_usd_wei)) / 1e18);
    int realized_profit_usd_wei =
      (-size_atto * (int(trade_price_usd_wei) - int(average_entry_price_usd_wei))) / 1e18;
    return (new_cost_balance_usd_wei, Utils.to_evr_wei(evr_per_usd_wei, realized_profit_usd_wei));
  }

  function compute_fee_evr_wei(uint evr_per_usd_wei, int size_atto, uint fee_per_contract_usd_wei)
    private
    pure
    returns (uint)
  {
    return uint(Utils.to_evr_wei(evr_per_usd_wei,
      int((Utils.abs(size_atto) * fee_per_contract_usd_wei) / 1e18)));
  }

  function get_open_contracts_delta_atto(TraderBalance[] new_trader_balances,
    TraderBalance[] old_trader_balances)
    private
    pure
    returns (int)
  {
    assert(new_trader_balances.length == old_trader_balances.length);
    int open_contracts_delta_atto = 0;

    for (uint i = 0; i < new_trader_balances.length; ++i) {
      open_contracts_delta_atto +=
        int(Utils.abs(new_trader_balances[i].contract_balance_atto) -
          Utils.abs(old_trader_balances[i].contract_balance_atto));
    }

    return open_contracts_delta_atto;
  }

  function get_average_entry_price_usd_wei(int contract_balance_atto, int cost_balance_usd_wei)
    internal
    pure
    returns (uint)
  {
    if (contract_balance_atto == 0) {
      return 0;
    }

    int aep = (cost_balance_usd_wei * 1e18) / contract_balance_atto;
    assert(aep > 0);
    return uint(aep);
  }

  function get_exposure_usd_wei(uint trade_price_usd_wei, int contract_balance_atto)
    internal
    pure
    returns (int)
  {
    return (contract_balance_atto * int(trade_price_usd_wei)) / 1e18;
  }

  function get_margin_required_usd_wei(int contract_balance_atto, uint margin_usd_wei)
    internal
    pure
    returns (uint)
  {
    return (Utils.abs(contract_balance_atto) * margin_usd_wei) / 1e18;
  }

  function get_excess_margin_usd_wei(uint evr_per_usd_wei, uint trade_price_usd_wei,
    TraderBalance tb, uint margin_usd_wei)
    internal
    pure
    returns (int)
  {
    int net_liquidation_value_usd_wei =
      get_net_liquidation_value_usd_wei(evr_per_usd_wei, trade_price_usd_wei, tb);
    uint margin_required_usd_wei =
      get_margin_required_usd_wei(tb.contract_balance_atto, margin_usd_wei);

    return net_liquidation_value_usd_wei - int(margin_required_usd_wei);
  }

  function get_net_liquidation_value_usd_wei(uint evr_per_usd_wei, uint trade_price_usd_wei,
    TraderBalance tb)
    internal
    pure
    returns (int)
  {
    int unrealized_profit_usd_wei =
      get_exposure_usd_wei(trade_price_usd_wei, tb.contract_balance_atto) - tb.cost_balance_usd_wei;

    return Utils.to_usd_wei(evr_per_usd_wei, tb.deposit_balance_evr_wei)
      + unrealized_profit_usd_wei;
  }

  function get_max_position_size_atto(int nlv_usd_wei, uint margin_usd_wei)
    internal
    pure
    returns (uint)
  {
    if (nlv_usd_wei <= 0)
      return 0;

    return (uint(nlv_usd_wei) * 1e18) / margin_usd_wei;
  }
}
