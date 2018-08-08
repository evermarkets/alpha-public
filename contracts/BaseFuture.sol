pragma solidity ^0.4.18;

// WARNING: the int() casts below are not safe for very large uints
// TODO(rogs): does using uint128 solve the problem? Or should we use the SafeMath library?

import './EVRToken.sol';
import './FL.sol';
import './Utils.sol';

library BaseFuture {

  struct Parameters {
    uint initial_margin_usd_wei;
    uint maintenance_margin_usd_wei;
    uint fee_per_contract_usd_wei;
  }

  struct State {
    address[] traders;
    mapping(address => bool) in_traders_list;
    mapping(address => FL.TraderBalance) trader_balances;
    // Note that "open contracts" is not the same thing as open interest. If Alice is long 5
    // contracts, and Bob is short 5 contracts, the open interest (as traditionally calculated)
    // would be 5, but the number we want to track is the sum of the absolute value of all the
    // positions, which in this case would be 10.
    // (If the sum of all the traders' positions is zero, then the "open contracts" is just double
    // the open interest, but if they don't sum to zero, then the open interest is not defined.)
    uint open_contracts_atto;
    uint fee_balance_evr_wei;
  }

  struct Data {
    EVRToken evr;
    Parameters params;
    State state;
  }

  struct ComputeMarkPositionResult {
    bool need_to_reassign;
    address[] traders;
    bool can_add_trades;
    FL.TraderBalance[] new_trader_balances;
    uint fee_volume_atto;
    int net_position_change_atto;
    int open_contracts_delta_atto;
    bytes32 error_message;
  }

  /*
   *  Public functions
   */
  function deposit(Data storage self, address trader, uint amount_evr_wei)
    public
  {
    // transfer EVR from sender to this contract (must be preapproved)
    require(self.evr.transferFrom(msg.sender, this, amount_evr_wei));

    record_deposit(self, trader, amount_evr_wei);
  }

  function record_deposit(Data storage self, address trader, uint amount_evr_wei)
    internal
  {
    self.state.trader_balances[trader].deposit_balance_evr_wei += int(amount_evr_wei);
    add_trader(self, trader);
  }

  function withdraw(Data storage self, uint evr_per_usd_wei, uint trade_price_usd_wei,
    address trader, uint amount_evr_wei)
    public
  {
    require(msg.sender == trader);
    record_withdrawal(self, evr_per_usd_wei, trade_price_usd_wei, trader, amount_evr_wei);
    require(self.evr.transfer(trader, amount_evr_wei));
  }

  function record_withdrawal(Data storage self, uint evr_per_usd_wei, uint trade_price_usd_wei,
    address trader, uint amount_evr_wei)
    internal
  {
    require(self.state.trader_balances[trader].deposit_balance_evr_wei >= int(amount_evr_wei));

    int amount_available_evr_wei =
      Utils.to_evr_wei(evr_per_usd_wei, get_available_funds_usd_wei(self, trader, evr_per_usd_wei,
        trade_price_usd_wei));
    require(int(amount_evr_wei) <= amount_available_evr_wei);

    self.state.trader_balances[trader].deposit_balance_evr_wei -= int(amount_evr_wei);
  }

  function withdraw_fees(Data storage self)
    public
  {
    uint amount_requested_evr_wei = self.state.fee_balance_evr_wei;
    self.state.fee_balance_evr_wei = 0;
    require(self.evr.transfer(msg.sender, amount_requested_evr_wei));
  }

  function add_trader(Data storage self, address t)
    public
  {
    if (self.state.in_traders_list[t]) {
      return;
    }

    self.state.traders.push(t);
    self.state.in_traders_list[t] = true;
  }

  /*
   *  Public read-only functions
   */
  function get_initial_margin_usd_wei(Data storage self) public view returns (uint) {
    return self.params.initial_margin_usd_wei;
  }

  function get_maintenance_margin_usd_wei(Data storage self) public view returns (uint) {
    return self.params.maintenance_margin_usd_wei;
  }

  function get_fee_per_contract_usd_wei(Data storage self) public view returns (uint) {
    return self.params.fee_per_contract_usd_wei;
  }

  function get_fee_balance_evr_wei(Data storage self) public view returns (uint) {
    return self.state.fee_balance_evr_wei;
  }

  function get_contract_balance_atto(Data storage self, address trader) public view returns (int) {
    return self.state.trader_balances[trader].contract_balance_atto;
  }

  function get_cost_balance_usd_wei(Data storage self, address trader) public view returns (int) {
    return self.state.trader_balances[trader].cost_balance_usd_wei;
  }

  function get_deposit_balance_evr_wei(Data storage self, address trader) public view returns (int) {
    return self.state.trader_balances[trader].deposit_balance_evr_wei;
  }

  function get_average_entry_price_usd_wei(Data storage self, address trader)
    public
    view
    returns (uint)
  {
    var tb = self.state.trader_balances[trader];
    return FL.get_average_entry_price_usd_wei(tb.contract_balance_atto, tb.cost_balance_usd_wei);
  }

  function get_net_liquidation_value_usd_wei(Data storage self, address trader,
    uint evr_per_usd_wei, uint trade_price_usd_wei)
    public
    view
    returns (int)
  {
    return FL.get_net_liquidation_value_usd_wei(evr_per_usd_wei, trade_price_usd_wei,
      self.state.trader_balances[trader]);
  }

  // Available Funds is defined to be: (Net Liquidation Value - Initial margin).
  function get_available_funds_usd_wei(Data storage self, address trader, uint evr_per_usd_wei,
    uint trade_price_usd_wei)
    public
    view
    returns (int)
  {
    return FL.get_excess_margin_usd_wei(evr_per_usd_wei, trade_price_usd_wei,
      self.state.trader_balances[trader], self.params.initial_margin_usd_wei);
  }

  // Excess Liquidity is defined to be: (Net Liquidation Value - Maintenance margin).
  function get_excess_liquidity_usd_wei(Data storage self, address trader, uint evr_per_usd_wei,
    uint trade_price_usd_wei)
    public
    view
    returns (int)
  {
    return FL.get_excess_margin_usd_wei(evr_per_usd_wei, trade_price_usd_wei,
      self.state.trader_balances[trader], self.params.maintenance_margin_usd_wei);
  }

  // TODO(rogs): factor this into a total_trader_usd_balances and total_trader_evr_balances?
  function get_total_trader_balances_usd_wei(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei)
    public
    view
    returns (int s)
  {
    for (uint i = 0; i < self.state.traders.length; ++i) {
      s += get_net_liquidation_value_usd_wei(self, self.state.traders[i], evr_per_usd_wei,
        trade_price_usd_wei);
    }
  }

  function get_total_balance_evr_wei(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei)
    public
    view
    returns (int)
  {
    return int(get_fee_balance_evr_wei(self)) +
      Utils.to_evr_wei(evr_per_usd_wei, get_total_trader_balances_usd_wei(self, evr_per_usd_wei,
        trade_price_usd_wei));
  }

  /*
   *  Internal functions
   */
  function update_balances(Data storage self, address[] traders,
    FL.TraderBalance[] new_trader_balances, int expected_open_contracts_delta_atto)
    internal
  {
    assert(traders.length == new_trader_balances.length);
    int open_contracts_delta_atto = 0;
    for (uint i = 0; i < traders.length; ++i) {
      address t = traders[i];
      open_contracts_delta_atto +=
        int(Utils.abs(new_trader_balances[i].contract_balance_atto) -
          Utils.abs(self.state.trader_balances[t].contract_balance_atto));
      self.state.trader_balances[t].contract_balance_atto =
        new_trader_balances[i].contract_balance_atto;
      self.state.trader_balances[t].cost_balance_usd_wei =
        new_trader_balances[i].cost_balance_usd_wei;
      self.state.trader_balances[t].deposit_balance_evr_wei =
        new_trader_balances[i].deposit_balance_evr_wei;
    }
    assert(open_contracts_delta_atto == expected_open_contracts_delta_atto);
    int new_open_contracts_atto = int(self.state.open_contracts_atto) + open_contracts_delta_atto;
    assert(new_open_contracts_atto >= 0);
    self.state.open_contracts_atto = uint(new_open_contracts_atto);
  }

  /*
   *  Internal read-only functions
   */
  function compute_add_trades(Data storage self, uint evr_per_usd_wei, uint trade_price_usd_wei,
    address[] traders, int[] sizes_atto, bool sum_to_zero, bool require_initial_margin)
    internal
    view
    returns (FL.ComputeAddTradesResult)
  {
    return compute_add_trades_with_custom_fee(self, evr_per_usd_wei, trade_price_usd_wei, traders,
      sizes_atto, sum_to_zero, require_initial_margin, self.params.fee_per_contract_usd_wei);
  }

  function compute_add_trades_with_custom_fee(Data storage self, uint evr_per_usd_wei,
    uint trade_price_usd_wei, address[] traders, int[] sizes_atto, bool sum_to_zero,
    bool require_initial_margin, uint custom_fee_per_contract_usd_wei)
    internal
    view
    returns (FL.ComputeAddTradesResult)
  {
    FL.ComputeAddTradesResult memory failure;

    FL.TraderBalance[] memory trader_balances = new FL.TraderBalance[](traders.length);
    for (uint i = 0; i < traders.length; ++i) {
      address t = traders[i];
      if (!self.state.in_traders_list[t]) {
        failure.error_message = "!in_traders_list[t]";
        return failure;
      }
      trader_balances[i] = self.state.trader_balances[t];
    }

    return FL.compute_add_trades(
      FL.ComputeAddTradesParams(evr_per_usd_wei, trade_price_usd_wei, sizes_atto, trader_balances,
      custom_fee_per_contract_usd_wei, self.params.initial_margin_usd_wei, sum_to_zero, require_initial_margin)
    );
  }

  function compute_mark_position(Data storage self, uint evr_per_usd_wei,
    uint marking_price_usd_wei, address trader, int additional_trader_deposit_evr_wei,
    address assignee)
    internal
    view
    returns (ComputeMarkPositionResult result)
  {
    int contracts_to_assign_atto = get_contracts_to_reassign_atto(self, evr_per_usd_wei,
      marking_price_usd_wei, trader, additional_trader_deposit_evr_wei);

    if (contracts_to_assign_atto != 0) {
      result.need_to_reassign = true;

      result.traders = new address[](2);
      result.traders[0] = trader;
      result.traders[1] = assignee;

      int[] memory sizes_atto = new int[](2);
      sizes_atto[0] = -contracts_to_assign_atto;
      sizes_atto[1] = contracts_to_assign_atto;

      var add_trades_result = compute_add_trades_with_custom_fee(self, evr_per_usd_wei,
        marking_price_usd_wei, result.traders, sizes_atto, true, false, 0);

      result.can_add_trades = add_trades_result.can_add_trades;
      result.new_trader_balances = add_trades_result.new_trader_balances;
      result.fee_volume_atto = add_trades_result.fee_volume_atto;
      result.net_position_change_atto = add_trades_result.net_position_change_atto;
      result.open_contracts_delta_atto = add_trades_result.open_contracts_delta_atto;
      result.error_message = add_trades_result.error_message;
    }
  }

  function get_contracts_to_reassign_atto(Data storage self, uint evr_per_usd_wei,
    uint marking_price_usd_wei, address trader, int additional_trader_deposit_evr_wei)
    internal
    view
    returns (int)
  {
    FL.TraderBalance memory tb = self.state.trader_balances[trader];
    int additional_trader_deposit_usd_wei = Utils.to_usd_wei(evr_per_usd_wei,
      additional_trader_deposit_evr_wei);
    int excess_margin_usd_wei = additional_trader_deposit_usd_wei +
      FL.get_excess_margin_usd_wei(evr_per_usd_wei, marking_price_usd_wei, tb,
        self.params.maintenance_margin_usd_wei);

    if (excess_margin_usd_wei >= 0)
      return 0;

    int nlv_usd_wei = additional_trader_deposit_usd_wei +
      FL.get_net_liquidation_value_usd_wei(evr_per_usd_wei, marking_price_usd_wei, tb);
    int contracts_to_leave_atto = Utils.sign(tb.contract_balance_atto) *
      int(FL.get_max_position_size_atto(nlv_usd_wei, self.params.initial_margin_usd_wei));
    return tb.contract_balance_atto - contracts_to_leave_atto;
  }
}
