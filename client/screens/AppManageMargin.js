import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import RaisedButton from 'material-ui/RaisedButton';
import RefreshIndicator from 'material-ui/RefreshIndicator';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import AddProductsToSyndicateDialog from '../components/AddProductsToSyndicateDialog';
import ManageCollateralDialog from '../components/ManageCollateralDialog';
import SyndicatePanel from '../components/SyndicatePanel';

import app from '../feathers';
import chainMod from '../helpers/chain';
import randHex from '../../common/randHex';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { registerTransaction } from '../actions/transactions';
import { getMySyndicates } from '../selectors/syndicates';

class AppManageMargin extends Component {
  static propTypes = {
    // from react-redux
    mySyndicates: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool.isRequired,
    refreshSyndicates: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    // create syndicate dialog state
    addFutureDialogOpen: false,
    addFutureDialogKey: '',

    // lender pool dialog state
    lenderPoolDialogOpen: false,
    lenderPoolDialogName: '',
    lenderPoolDialogKey: '',
    lenderPoolDialogExcess: 0,
  };

  onCreateSyndicate = () => {
    this.deployEmptySyndicate().catch(console.error);
  }

  onAddFutureDialogRequestClose = (syndicateParams) => {
    this.setState({
      addFutureDialogOpen: false,
    });

    if (syndicateParams) {
      this.addFutureToSyndicate(syndicateParams).catch(console.error);
    }
  }

  onAddFutureClick = (syndicate) => {
    this.setState({
      addFutureDialogOpen: true,
      addFutureDialogKey: syndicate,
    });
  }

  onLenderPoolClick = (syndicate) => {
    this.setState({
      lenderPoolDialogOpen: true,
      lenderPoolDialogName: syndicate.displayName,
      lenderPoolDialogKey: syndicate.key,
      lenderPoolDialogExcess: syndicate.availableLenderBalance,
    });
  }

  onLenderPoolDialogRequestClose = (txHash) => {
    this.setState({
      lenderPoolDialogOpen: false,
    });

    if (txHash)
      this.props.registerTransaction(txHash, this.onTxComplete);
  }

  onPostLenderTokens = (mpKey, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.depositForLender(mpKey, valueEVR)
      .then(txHash => this.onLenderPoolDialogRequestClose(txHash));
  }

  onWithdrawLenderTokens = (mpKey, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.withdrawForLender(mpKey, valueEVR)
      .then(txHash => this.onLenderPoolDialogRequestClose(txHash));
  }

  onCollectFeesClick = (syndicate) => {
    const chain = chainMod.chain(chainMod.getWeb3());

    if (syndicate.availableFees > 0)
      chain.withdrawLenderFees(syndicate.key)
        .then(txHash => this.props.registerTransaction(txHash, this.onTxComplete));
  }

  async deployEmptySyndicate() {
    const Web3 = chainMod.getWeb3();
    const chain = chainMod.chain(Web3);
    const mpKey = randHex(8);

    // create the MarginProvider contract
    const txHash = await chain.createMarginProvider(mpKey);

    const userAddress = Web3.eth.accounts[0];
    const Syndicates = app.service('syndicates');
    Syndicates.create({
      key: mpKey,
      creatorAddress: userAddress,
    }).catch(console.error);

    this.props.registerTransaction(txHash, this.onTxComplete);
  }

  async addFutureToSyndicate(params) {
    const chain = chainMod.chain(chainMod.getWeb3());

    const SyndicateProducts = app.service('syndicateProducts');
    const txHash = await chain.addFutureToMarginProvider(
      params.key,
      params.productName,
      params.numLeverage,
      params.numFeePerContract,
    );

    SyndicateProducts.create({
      key: params.key,
      productId: params.productId,
      leverageMult: params.numLeverage,
    }).catch(console.error);

    this.props.registerTransaction(txHash, this.onTxComplete);
  }

  onTxComplete = () => {
    this.props.refreshSyndicates();
  }

  renderSyndicate(syndicate) {
    return (
      <SyndicatePanel
        key={syndicate.key}
        syndicate={syndicate}
        onCollectFeesClick={this.onCollectFeesClick}
        onLenderPoolClick={this.onLenderPoolClick}
        onAddFutureClick={this.onAddFutureClick}
        showCollectFees={syndicate.availableFees > 0}
        showAddFuture
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
      noSyndicates: {
        width: 800,
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
    const noSyndicatesMessage = (
      <div style={styles.noSyndicates}>
        You have not created any margin syndicates.<p />
        To create a syndicates and start collecting lending fees, click the button above.
      </div>
    );
    return (
      <div>
        <DrawerSidebar defaultPage="manageMargin" />
        <NavBar />
        <AddProductsToSyndicateDialog
          open={this.state.addFutureDialogOpen}
          syndicate={this.state.addFutureDialogKey}
          onRequestClose={this.onAddFutureDialogRequestClose}
        />
        <ManageCollateralDialog
          contextTerm="Lender Tokens"
          open={this.state.lenderPoolDialogOpen}
          productName={this.state.lenderPoolDialogName}
          productKey={this.state.lenderPoolDialogKey}
          excess={this.state.lenderPoolDialogExcess}
          onRequestClose={this.onLenderPoolDialogRequestClose}
          onPost={this.onPostLenderTokens}
          onWithdraw={this.onWithdrawLenderTokens}
        />
        <div style={contentStyle}>
          <table style={{ width: 800 }}>
            <tbody>
              <tr>
                <td style={{ textAlign: 'right' }}>
                  <RaisedButton
                    label="Create Syndicate"
                    style={{ marginRight: 5 }}
                    onClick={this.onCreateSyndicate}
                    primary
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <br />
          <RefreshIndicator
            size={40}
            left={575}
            top={175}
            status={this.props.isLoading ? 'loading' : 'hide'}
          />
          { (this.props.mySyndicates.length === 0) &&
            !this.props.isLoading ?
              noSyndicatesMessage : null }
          { (this.props.mySyndicates.length > 0) ?
             makeHeader('My Margin Syndicates') : null }
          {this.props.mySyndicates.map(this.renderSyndicate, this)}
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  mySyndicates: getMySyndicates(state),
  isLoading: state.syndicates.isLoading,
});

const mapDispatchToProps = dispatch => ({
  // params: forceFetch, invalidateCache
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppManageMargin);
