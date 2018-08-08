import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import RaisedButton from 'material-ui/RaisedButton';
import RefreshIndicator from 'material-ui/RefreshIndicator';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import CreateContractDialog from '../components/CreateContractDialog';
import ManageCollateralDialog from '../components/ManageCollateralDialog';
import ContractPanel from '../components/ContractPanel';

import app from '../feathers';
import chainMod from '../helpers/chain';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { fetchProductsIfNeeded } from '../actions/products';
import { registerTransaction } from '../actions/transactions';
import { getMyActiveProducts, getMyExpiredProducts } from '../selectors/products';

class AppManageContracts extends Component {
  static propTypes = {
    // from react-redux
    productsExpiredNames: PropTypes.arrayOf(PropTypes.object).isRequired,
    productsActiveNames: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool.isRequired,
    refreshSyndicates: PropTypes.func.isRequired,
    refreshProducts: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    // create contract dialog state
    createDialogOpen: false,

    // backstop dialog state
    backstopDialogOpen: false,
    backstopDialogProductName: '',
    backstopDialogExcess: 0,
  };

  onCreateContract = () => {
    this.setState({
      createDialogOpen: true,
    });
  }

  onCreateDialogRequestClose = (contractParams) => {
    this.setState({
      createDialogOpen: false,
    });

    if (contractParams) {
      this.deployContract(contractParams);
    }
  }

  onBackstopClick = (product) => {
    this.setState({
      backstopDialogOpen: true,
      backstopDialogProductName: product.name,
      backstopDialogExcess: product.excessBackstop,
    });
  }

  onBackstopDialogRequestClose = (txHash) => {
    this.setState({
      backstopDialogOpen: false,
    });

    if (txHash) {
      this.props.registerTransaction(txHash, this.onTxComplete);
    }
  }

  onPostBackstop = (productName, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.depositForBackstop(productName, valueEVR)
      .then(txHash => this.onBackstopDialogRequestClose(txHash));
  }

  onWithdrawBackstop = (productName, valueEVR) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    chain.withdrawForBackstop(productName, valueEVR)
      .then(txHash => this.onBackstopDialogRequestClose(txHash));
  }

  onCloseOutClick = (product) => {
    const chain = chainMod.chain(chainMod.getWeb3());
    if (product.excessBackstop > 0)
      chain.withdrawForBackstop(product.name, product.excessBackstop)
        .then(txHash => this.props.registerTransaction(txHash, this.onTxComplete));
    if (product.availableFees > 0)
      chain.withdrawCreatorFees(product.name)
        .then(txHash => this.props.registerTransaction(txHash, this.onTxComplete));
  }

  static canCloseOut(product) {
    return (
      product.isExpired &&
      product.isMine
    );
  }

  async deployContract(params) {
    const Web3 = chainMod.getWeb3();
    const chain = chainMod.chain(Web3);

    // create the Future contract
    const txHashFund = await chain.createFuture(
      params.textName,
      params.numExpirationTimestamp,
      params.numInitialMargin,
      params.numMainteanceMargin,
      params.numBackstopDepositRatio,
      params.numFeePerContract,
      params.numMultiplier,
    );

    const creatorAddress = Web3.eth.accounts[0];
    const Products = app.service('products');
    const product = await Products.create({
      name: params.textName,
      longName: params.textLongName,
      expiry: params.dateExpiration,
      tags: params.textTags,
      creatorAddress,
      demoDisplayOnly: false,
    });

    const SyndicateProducts = app.service('syndicateProducts');
    SyndicateProducts.create({
      key: 'default',
      productId: product.id,
      leverageMult: 1,
    });

    const Auctions = app.service('auctions');
    Auctions.create({
      productName: params.textName,
    });

    // show tx snackbar
    this.props.registerTransaction(txHashFund, this.onTxComplete);
  }

  onTxComplete = () => {
    this.props.refreshProducts();
    this.props.refreshSyndicates();
  }

  renderProduct(product) {
    return (
      <ContractPanel
        key={product.id}
        product={product}
        onCloseOutClick={AppManageContracts.canCloseOut(product) ? this.onCloseOutClick : null}
        onBackstopClick={this.onBackstopClick}
        showFeesCollected
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
      noContracts: {
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
    const noContractsMessage = (
      <div style={styles.noContracts}>
        You have not created any active contracts.<p />
        To create a contract and start collecting trading fees, click the button above.
      </div>
    );
    return (
      <div>
        <DrawerSidebar defaultPage="manageContracts" />
        <NavBar />
        <CreateContractDialog
          open={this.state.createDialogOpen}
          onRequestClose={this.onCreateDialogRequestClose}
        />
        <ManageCollateralDialog
          contextTerm="Backstop"
          open={this.state.backstopDialogOpen}
          productName={this.state.backstopDialogProductName}
          excess={this.state.backstopDialogExcess}
          onRequestClose={this.onBackstopDialogRequestClose}
          onPost={this.onPostBackstop}
          onWithdraw={this.onWithdrawBackstop}
        />
        <div style={contentStyle}>
          <table style={{ width: 800 }}>
            <tbody>
              <tr>
                <td style={{ textAlign: 'right' }}>
                  <RaisedButton
                    label="Create Contract"
                    style={{ marginRight: 5 }}
                    onClick={this.onCreateContract}
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
          { (this.props.productsExpiredNames.length === 0) &&
            (this.props.productsActiveNames.length === 0) &&
            !this.props.isLoading ?
              noContractsMessage : null }
          { (this.props.productsExpiredNames.length > 0) ?
             makeHeader('My Expired Contracts') : null }
          {this.props.productsExpiredNames.map(this.renderProduct, this)}
          { (this.props.productsActiveNames.length > 0) ?
             makeHeader('My Active Contracts') : null }
          {this.props.productsActiveNames.map(this.renderProduct, this)}
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  productsActiveNames: getMyActiveProducts(state),
  productsExpiredNames: getMyExpiredProducts(state),
  isLoading: state.products.isLoading,
});

const mapDispatchToProps = dispatch => ({
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  refreshProducts: () => dispatch(fetchProductsIfNeeded(true, true)), // forceFetch, invalidateCache
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppManageContracts);
