import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import RefreshIndicator from 'material-ui/RefreshIndicator';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import SyndicatePanel from '../components/SyndicatePanel';
import ManageCollateralDialog from '../components/ManageCollateralDialog';

import chainMod from '../helpers/chain';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { registerTransaction } from '../actions/transactions';
import { getDepositedSyndicates, getAvailableSyndicatesForFavorites } from '../selectors/syndicates';

class AppMargin extends Component {
  static propTypes = {
    // from react-redux
    syndicatesDeposited: PropTypes.arrayOf(PropTypes.object).isRequired,
    syndicatesFavorites: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool.isRequired,
    refreshSyndicates: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    // collateral dialog state
    collateralDialogOpen: false,
    collateralDialogProductName: '',
    collateralDialogKey: null,
    collateralDialogExcess: 0,
  };

  onManageCollateralClick = (syndicate) => {
    this.setState({
      collateralDialogOpen: true,
      collateralDialogProductName: syndicate.displayName,
      collateralDialogKey: syndicate,
      collateralDialogExcess: syndicate.availableDeposit * syndicate.fxRate,
    });
  }

  onCollateralDialogRequestClose = (txHash) => {
    this.setState({
      collateralDialogOpen: false,
    });

    if (txHash)
      this.props.registerTransaction(txHash, this.onTxComplete);
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

  onTxComplete = () => {
    this.props.refreshSyndicates();
  }

  renderSyndicate(syndicate) {
    return (
      <SyndicatePanel
        key={syndicate.key}
        syndicate={syndicate}
        onDepositClick={this.onManageCollateralClick}
        showCollectFees={false}
        showAddFuture={false}
      />
    );
  }

  render() {
    const styles = {
      wrapper: {
        display: 'flex',
        flexWrap: 'wrap',
      },
      paper: {
        width: 800,
      },
      subheader: {
        width: 800,
        lineHeight: '24px',
        backgroundColor: '#3a7dae',
        color: '#ffffff',
        marginBottom: 10,
      },
      noFavorites: {
        width: 800,
        marginTop: 65,
        fontSize: 20,
        textAlign: 'center',
        fontFamily: 'Roboto, sans-serif',
      },
    };
    const contentStyle = {
      marginLeft: 210,
      marginTop: 6,
    };
    const makeHeader = name => (
      <Paper zDepth={1} style={styles.paper}>
        <Subheader style={styles.subheader}>{name}</Subheader>
      </Paper>
    );
    const noFavoritesMessage = (
      <div style={styles.noFavorites}>
        You do not have any bookmarked contracts.<p />
        Please go to {'"Contracts"'}, click the bookmark icon, and come back to
        deposit collateral to associated margin accounts.
      </div>
    );
    return (
      <div>
        <DrawerSidebar defaultPage="margin" />
        <NavBar />
        <ManageCollateralDialog
          contextTerm="Collateral"
          open={this.state.collateralDialogOpen}
          productName={this.state.collateralDialogProductName}
          productKey={this.state.collateralDialogKey}
          excess={this.state.collateralDialogExcess}
          onRequestClose={this.onCollateralDialogRequestClose}
          onPost={this.onPostCollateral}
          onWithdraw={this.onWithdrawCollateral}
        />
        <div style={contentStyle}>
          <RefreshIndicator
            size={40}
            left={575}
            top={175}
            status={this.props.isLoading ? 'loading' : 'hide'}
          />
          { (this.props.syndicatesDeposited.length === 0) &&
            (this.props.syndicatesFavorites.length === 0) &&
            !this.props.isLoading ?
            noFavoritesMessage : null }
          { (this.props.syndicatesDeposited.length > 0) ?
             makeHeader('Margin Accounts With Deposits') : null }
          {this.props.syndicatesDeposited.map(this.renderSyndicate, this)}
          { (this.props.syndicatesFavorites.length > 0) ?
             makeHeader('Available Margin Accounts (for favorite contracts)') : null }
          {this.props.syndicatesFavorites.map(this.renderSyndicate, this)}
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  syndicatesDeposited: getDepositedSyndicates(state),
  syndicatesFavorites: getAvailableSyndicatesForFavorites(state),
  isLoading: state.syndicates.isLoading,
});

const mapDispatchToProps = dispatch => ({
  // params: forceFetch, invalidateCache
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppMargin);
