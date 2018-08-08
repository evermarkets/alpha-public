import React from 'react';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import FlatButton from 'material-ui/FlatButton';
import IconButton from 'material-ui/IconButton';
import SvgIconBookmark from 'material-ui/svg-icons/action/bookmark';
import SvgIconBookmarkBorder from 'material-ui/svg-icons/action/bookmark-border';

import formatters from '../../common/formatters';

const ContractPanel = (props) => {
  const styles = {
    table: {
      fontSize: 14,
      paddingLeft: 20,
      paddingBottom: 15,
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
  const dataRows = (
    <tbody>
      <tr>
        <td style={styles.title}>Id</td>
        <td style={{ width: 160 }}>{props.product.name}</td>
        <td style={styles.title}>Open Interest</td>
        <td>{props.product.openInterestString}</td>
      </tr>
      <tr>
        <td style={styles.title}>Expiry (UTC)</td>
        <td>{props.product.expiryString}</td>
        <td style={styles.title}>Backstop</td>
        <td>{props.product.backstopString}</td>
      </tr>
      <tr>
        <td style={styles.title}>Last Price</td>
        <td>{props.product.lastPriceString}</td>
        <td style={styles.title}>{props.showFeesCollected ? 'Fees Collected' : 'Fees'}</td>
        <td>
          {props.showFeesCollected
            ? props.product.availableFeesString
            : props.product.feesString}
        </td>
      </tr>
      <tr>
        <td style={styles.title}>Multiplier</td>
        <td>{formatters.formatDecimal(props.product.multiplier, 0)}</td>
        <td style={styles.title} />
        <td />
      </tr>
      <tr>
        <td style={styles.title}>Margin</td>
        <td colSpan={3}>{props.product.marginRequirementString}</td>
      </tr>
    </tbody>
  );
  return (
    <div>
      <Paper zDepth={2} style={{ width: 800 }}>
        <Subheader>
          <span style={{ fontWeight: 'bold', float: 'left' }}>
            { props.onFavoriteClick ?
              <IconButton
                iconStyle={styles.smallIcon}
                style={styles.small}
                onClick={() => props.onFavoriteClick(props.product, !props.product.isFavorite)}
              >
                {props.product.isFavorite ? <SvgIconBookmark /> : <SvgIconBookmarkBorder />}
              </IconButton> : null }
            {props.product.longName}
          </span>
          <span style={{ float: 'right' }}>
            { props.onCloseOutClick ?
              <FlatButton
                label="Close Out"
                style={{ marginRight: 5 }}
                onClick={() => props.onCloseOutClick(props.product)}
              /> : null }
            { props.onBackstopClick ?
              <FlatButton
                label="Backstop"
                style={{ marginRight: 5 }}
                onClick={() => props.onBackstopClick(props.product)}
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

ContractPanel.propTypes = {
  product: PropTypes.shape({
    name: PropTypes.string,
    longName: PropTypes.string,
    feesString: PropTypes.string,
    availableFeesString: PropTypes.string,
    marginRequirementString: PropTypes.string,
    lastPriceString: PropTypes.string,
    openInterestString: PropTypes.string,
    backstopString: PropTypes.string,
    expiryString: PropTypes.string,
    isFavorite: PropTypes.bool,
    multiplier: PropTypes.number,
  }).isRequired,
  onBackstopClick: PropTypes.func,
  onCloseOutClick: PropTypes.func,
  onFavoriteClick: PropTypes.func,
  showFeesCollected: PropTypes.bool.isRequired,
};

export default ContractPanel;
