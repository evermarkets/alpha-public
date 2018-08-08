import React, { Component } from 'react';
import PropTypes from 'prop-types';

import app from '../feathers';
import chainMod from '../helpers/chain';
import ModalErrorDialog from './ModalErrorDialog';

export default class MetamaskChecker extends Component {
  static propTypes = {
    children: PropTypes.node.isRequired,
  };

  state = {
    appOpen: false,
    metamaskDialogOpen: false,
    errorMessage: '',
  };

  componentWillMount() {
    // Verify:
    //   1. MetaMask injected
    //   2. MetaMask Web3 network matches server network.
    const Web3 = chainMod.getWeb3();
    if (!Web3) {
      this.showError('Please use a web3 browser.');
      return;
    }

    const networkIdToName = (id) => {
      if (id === '1')
        return 'Mainnet';
      else if (id === '4')
        return 'Rinkeby';
      else if (id === '*' || id > 100)
        return 'TestRPC';
      return id;
    };

    app.service('debug/web3NetworkVersion')
      .find()
      .then((serverNetwork) => {
        if (Web3.eth.accounts.length === 0) {
          // no user information
          this.showError(
            'MetaMask is not logged in. Please select a user on network' +
            ` ${networkIdToName(serverNetwork)}.`);
        } else if (
          // client/server network mismatch
          Web3.version.network !== 'loading' &&
          networkIdToName(serverNetwork) !== networkIdToName(Web3.version.network)) {
          this.showError(
            `Server network ${networkIdToName(serverNetwork)} does not match browser network ` +
            `${networkIdToName(Web3.version.network)}.`);
        } else {
          // all good. close error dialog if it's open.
          this.closeDialog();
        }
      });
  }

  showError(errorMessage) {
    this.setState({
      appOpen: false,
      metamaskDialogOpen: true,
      errorMessage,
    });
  }

  closeDialog() {
    this.setState({
      appOpen: true,
      metamaskDialogOpen: false,
    });
  }

  render() {
    if (this.state.metamaskDialogOpen) {
      return (
        <ModalErrorDialog
          open={this.state.metamaskDialogOpen}
          title="MetaMask Browser Mismatch"
          errorMessage={this.state.errorMessage}
        />
      );
    }

    if (this.state.appOpen) {
      return this.props.children;
    }

    return (
      <ModalErrorDialog
        open
        title="MetaMask"
        errorMessage="Connecting to MetaMask..."
      />
    );
  }
}
