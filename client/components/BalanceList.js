import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import { Table, TableBody, TableHeader, TableHeaderColumn,
  TableRow, TableRowColumn } from 'material-ui/Table';
import RefreshIndicator from 'material-ui/RefreshIndicator';

import ManageCollateralDialog from './ManageCollateralDialog';
import ComponentHeader from './ComponentHeader';
import CollateralButton from './CollateralButton';
import TradeButton from './TradeButton';

import chainMod from '../helpers/chain';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { registerTransaction } from '../actions/transactions';
import { getPositionsForBalanceList, getSyndicatesForBalanceList } from '../selectors/syndicates';
import formatters from '../../common/formatters';

class BalanceList extends Component {
  static propTypes = {
    // from react-redux
    positions: PropTypes.arrayOf(PropTypes.object).isRequired,
    syndicates: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool.isRequired,
    fetchData: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    // collateral dialog state
    collateralDialogOpen: false,
    collateralDialogName: '',
    collateralDialogKey: null,
    collateralDialogExcess: 0,
  };

  onManageCollateralClick = (syndicate) => {
    this.setState({
      collateralDialogOpen: true,
      collateralDialogName: syndicate.displayName,
      collateralDialogKey: syndicate,
      collateralDialogExcess: Math.max(syndicate.availableDeposit, 0) * syndicate.fxRate,
    });
  }

  onCollateralDialogRequestClose = (txHash) => {
    this.setState({
      collateralDialogOpen: false,
    });

    if (txHash)
      this.props.registerTransaction(txHash, this.onRefreshClick);
  }

  onPostCollateral = (syndicate, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.deposit(syndicate.key, valueEVR)
      .then(txHash => this.onCollateralDialogRequestClose(txHash));
  }

  onWithdrawCollateral = (syndicate, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.withdraw(syndicate.key, valueEVR)
      .then(txHash => this.onCollateralDialogRequestClose(txHash));
  }

  onRefreshClick = () => {
    this.props.fetchData();
  }

  static renderPosition(position) {
    const priceDiff = (position.lastPrice - position.averageExecutionPrice);
    const pnlPct = ((position.qty === 0 ? 0 : priceDiff) / (position.averageExecutionPrice || 1));
    const pnl = (priceDiff * position.qty * position.multiplier);

    let pnlColor;
    if (pnl > 0)
      pnlColor = 'green';
    else if (pnl < 0)
      pnlColor = 'red';
    else
      pnlColor = null;

    let pnlSign;
    if (pnl > 0)
      pnlSign = '+';
    else if (pnl < 0)
      pnlSign = '\u2212'; // minus sign
    else
      pnlSign = '';

    return (
      <TableRow key={position.displayName}>
        <TableRowColumn style={{ width: 100 }}>
          {position.displayName}
        </TableRowColumn>
        <TableRowColumn style={{ width: 175 }}>
          {position.syndicateDisplayName}
        </TableRowColumn>
        <TableRowColumn style={{ textAlign: 'right' }}>
          {formatters.formatDecimal(position.qty, 4)}
        </TableRowColumn>
        <TableRowColumn style={{ textAlign: 'right' }}>
          {formatters.formatDecimal(position.lastPrice)}
        </TableRowColumn>
        <TableRowColumn style={{ textAlign: 'right', color: pnlColor }}>
          {pnlSign}{formatters.formatDecimal(Math.abs(pnlPct) * 100, 2)}%
        </TableRowColumn>
        <TableRowColumn style={{ width: 75, textAlign: 'right', color: pnlColor }}>
          {pnlSign}${formatters.formatDecimal(Math.abs(pnl), 2)}
        </TableRowColumn>
        <TableRowColumn style={{ width: 75 }}>
          <TradeButton productId={position.id} />
        </TableRowColumn>
      </TableRow>
    );
  }

  renderSyndicate(syndicate) {
    const styles = {
      productName: {
        display: 'inline-block',
        verticalAlign: 'top',
        marginTop: 12,
      },
    };
    return (
      <TableRow key={syndicate.key}>
        <TableRowColumn style={{ width: 250 }}>
          <div>
            <div style={!syndicate.hideManageCollateral ? styles.productName : null}>
              {syndicate.displayName}
            </div>
            {!syndicate.hideManageCollateral
              ? <CollateralButton
                syndicate={syndicate}
                onClick={this.onManageCollateralClick}
              />
              : null}
          </div>
        </TableRowColumn>
        <TableRowColumn style={{ textAlign: 'right' }}>
          {syndicate.hideManageCollateral ? '' : '$'}{formatters.formatDecimal(Math.max(syndicate.availableDeposit, 0))} {syndicate.hideManageCollateral ? 'EMX' : ''}
        </TableRowColumn>
        <TableRowColumn style={{ textAlign: 'right' }}>
          {syndicate.hideManageCollateral ? '' : '$'}{formatters.formatDecimal(syndicate.lockedUpDeposit)}
        </TableRowColumn>
      </TableRow>
    );
  }

  render() {
    return (
      <div>
        <ManageCollateralDialog
          contextTerm="Collateral"
          open={this.state.collateralDialogOpen}
          productName={this.state.collateralDialogName}
          productKey={this.state.collateralDialogKey}
          excess={this.state.collateralDialogExcess}
          onRequestClose={this.onCollateralDialogRequestClose}
          onPost={this.onPostCollateral}
          onWithdraw={this.onWithdrawCollateral}
        />
        <RefreshIndicator
          size={40}
          left={575}
          top={175}
          status={this.props.isLoading ? 'loading' : 'hide'}
        />
        <ComponentHeader
          title="Positions"
          onRefreshClick={this.onRefreshClick}
          width={925}
        >
          <Table
            style={{ display: this.props.isLoading ? 'none' : 'table' }}
          >
            <TableHeader
              displaySelectAll={false}
              adjustForCheckbox={false}
            >
              <TableRow>
                <TableHeaderColumn style={{ width: 100 }}>Contract</TableHeaderColumn>
                <TableHeaderColumn style={{ width: 150 }}>Margin Account</TableHeaderColumn>
                <TableHeaderColumn>Quantity</TableHeaderColumn>
                <TableHeaderColumn>Price</TableHeaderColumn>
                <TableHeaderColumn>P&L (%)</TableHeaderColumn>
                <TableHeaderColumn style={{ width: 75 }}>P&L ($)</TableHeaderColumn>
                <TableHeaderColumn style={{ width: 75 }} />
              </TableRow>
            </TableHeader>
            <TableBody
              displayRowCheckbox={false}
              stripedRows
              showRowHover
            >
              {this.props.positions.map(BalanceList.renderPosition, this)}
            </TableBody>
          </Table>
        </ComponentHeader>
        <br />
        <ComponentHeader
          title="Margin Accounts"
          onRefreshClick={this.onRefreshClick}
          width={600}
        >
          <Table
            style={{ display: this.props.isLoading ? 'none' : 'table' }}
          >
            <TableHeader
              displaySelectAll={false}
              adjustForCheckbox={false}
            >
              <TableRow>
                <TableHeaderColumn style={{ width: 250 }}>Account</TableHeaderColumn>
                <TableHeaderColumn>Available Deposit</TableHeaderColumn>
                <TableHeaderColumn>Locked Up Deposit</TableHeaderColumn>
              </TableRow>
            </TableHeader>
            <TableBody
              displayRowCheckbox={false}
              stripedRows
              showRowHover
            >
              {this.props.syndicates.map(this.renderSyndicate, this)}
            </TableBody>
          </Table>
        </ComponentHeader>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  positions: getPositionsForBalanceList(state),
  syndicates: getSyndicatesForBalanceList(state),
  isLoading: state.syndicates.isLoading,
});

const mapDispatchToProps = dispatch => ({
  fetchData: () => dispatch(fetchSyndicatesIfNeeded(true, true)), // forceFetch, invalidateCache
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(mapStateToProps, mapDispatchToProps)(BalanceList);
