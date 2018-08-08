import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import GenericErrorBoundary from './GenericErrorBoundary';
import MetamaskChecker from './MetamaskChecker';
import TxSnackbar from './TxSnackbar';

const AppWrapper = props => (
  <div>
    <GenericErrorBoundary>
      <MetamaskChecker>
        <TxSnackbar
          active={props.activeTransactions}
          completed={props.completedTransactions}
        />
        {props.children}
      </MetamaskChecker>
    </GenericErrorBoundary>
  </div>
);

AppWrapper.propTypes = {
  children: PropTypes.node,
  activeTransactions: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  completedTransactions: PropTypes.object, // eslint-disable-line react/forbid-prop-types
};

const mapStateToProps = state => ({
  activeTransactions: state.transactions.active,
  completedTransactions: state.transactions.completed,
});

export default connect(mapStateToProps)(AppWrapper);
