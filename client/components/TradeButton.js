import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { browserHistory } from 'react-router';

import FlatButton from 'material-ui/FlatButton';

export default class TradeButton extends PureComponent {
  static propTypes = {
    productId: PropTypes.number.isRequired,
    style: PropTypes.any, // eslint-disable-line react/forbid-prop-types
  }

  onClick = () => {
    browserHistory.push({
      pathname: '/app/trade',
      state: {
        defaultProductId: this.props.productId,
      },
    });
  }

  render() {
    return (
      <span style={this.props.style}>
        <FlatButton
          label="Trade"
          onClick={this.onClick}
        />
      </span>
    );
  }
}
