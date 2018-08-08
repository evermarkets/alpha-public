import React from 'react';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import FlatButton from 'material-ui/FlatButton';

import formatters from '../../common/formatters';

const renderProduct = product => (
  <tr key={product.name}>
    <td>{product.name}</td>
    <td>{`${formatters.formatDecimal(product.leverageMult - 1, 1)}x`}</td>
    <td>{product.totalFeesString}</td>
  </tr>
);

const SyndicatePanel = (props) => {
  const styles = {
    table: {
      fontSize: 14,
      paddingLeft: 20,
      paddingBottom: 15,
      width: 500,
    },
    title: {
      color: '#999999',
      width: 100,
    },
    smallIcon: {
      width: 18,
      height: 18,
    },
    small: {
      width: 24,
      height: 24,
      top: 4,
      right: 5,
      padding: 2,
    },
  };
  const isDefaultAccount = (props.syndicate.key === 'default');
  const dataRows = (
    <tbody>
      <tr>
        <td style={styles.title}>{props.onLenderPoolClick ? 'Lender Pool' : 'Deposit'}</td>
        <td colSpan={2}>
          {props.onLenderPoolClick
            ? props.syndicate.lenderPoolString
            : props.syndicate.collateralString}
        </td>
      </tr>
      {!isDefaultAccount ?
        <tr>
          <td style={styles.title}>{props.onCollectFeesClick ? 'Fees Collected' : 'Lender Pool'}</td>
          <td colSpan={2}>
            {props.onCollectFeesClick
              ? props.syndicate.availableFeesString
              : props.syndicate.lenderPoolString}
          </td>
        </tr> : null }
      {!isDefaultAccount ? <tr style={{ height: 10 }} /> : null}
      {!isDefaultAccount ?
        <tr>
          <td style={styles.title}>Contract</td>
          <td style={styles.title}>Margin Matching</td>
          <td style={styles.title}>Total Fees</td>
        </tr> : null }
      {!isDefaultAccount ? props.syndicate.products.map(renderProduct) : null}
    </tbody>
  );
  return (
    <div>
      <Paper zDepth={2} style={{ width: 800 }}>
        <Subheader>
          <span style={{ fontWeight: 'bold', float: 'left' }}>
            {props.syndicate.displayName}
          </span>
          <span style={{ float: 'right' }}>
            { props.showCollectFees ?
              <FlatButton
                label="Collect Fees"
                style={{ marginRight: 5 }}
                onClick={() => props.onCollectFeesClick(props.syndicate)}
              /> : null }
            { props.onDepositClick ?
              <FlatButton
                label="Deposit"
                style={{ marginRight: 5 }}
                onClick={() => props.onDepositClick(props.syndicate)}
              /> : null }
            { props.onLenderPoolClick ?
              <FlatButton
                label="Lender Pool"
                style={{ marginRight: 5 }}
                onClick={() => props.onLenderPoolClick(props.syndicate)}
              /> : null }
            { props.showAddFuture ?
              <FlatButton
                label="Add Contract"
                style={{ marginRight: 5 }}
                onClick={() => props.onAddFutureClick(props.syndicate)}
              /> : null }
          </span>
          <div style={{ clear: 'both' }} />
        </Subheader>
        <table style={styles.table}>
          {dataRows}
        </table>
      </Paper>
      <br />
    </div>
  );
};

SyndicatePanel.propTypes = {
  syndicate: PropTypes.shape({
    key: PropTypes.string,
    displayName: PropTypes.string,
    products: PropTypes.arrayOf(PropTypes.object),
    availableFeesString: PropTypes.string,
    totalFeesString: PropTypes.string,
    lenderPoolString: PropTypes.string,
    collateralString: PropTypes.string,
  }).isRequired,
  onLenderPoolClick: PropTypes.func,
  onDepositClick: PropTypes.func,
  onCollectFeesClick: PropTypes.func,
  onAddFutureClick: PropTypes.func,
  showAddFuture: PropTypes.bool.isRequired,
  showCollectFees: PropTypes.bool.isRequired,
};

export default SyndicatePanel;
