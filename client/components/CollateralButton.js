import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

import IconButton from 'material-ui/IconButton';
import LockOutlineIcon from 'material-ui/svg-icons/action/lock-outline';

export default class CollateralButton extends PureComponent {
  static propTypes = {
    syndicate: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
    onClick: PropTypes.func.isRequired,
  }

  onClick = () => {
    this.props.onClick(this.props.syndicate);
  }

  render() {
    const styles = {
      smallIcon: {
        width: 18,
        height: 18,
      },
      small: {
        width: 36,
        height: 36,
        padding: 9,
      },
    };
    return (
      <span>
        <IconButton
          iconStyle={styles.smallIcon}
          style={styles.small}
          onClick={this.onClick}
        >
          <LockOutlineIcon />
        </IconButton>
      </span>
    );
  }
}
