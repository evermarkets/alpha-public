import React from 'react';
import PropTypes from 'prop-types';

import Divider from 'material-ui/Divider';
import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import IconButton from 'material-ui/IconButton';
import RefreshIcon from 'material-ui/svg-icons/action/cached';
import { white } from 'material-ui/styles/colors';

function ComponentHeader(props) {
  const styles = {
    subheader: {
      lineHeight: '24px',
      backgroundColor: '#3a7dae',
      color: '#ffffff',
    },
    smallIcon: {
      width: 15,
      height: 15,
    },
    small: {
      paddingTop: '5px',
      width: 15,
      height: 15,
    },
  };
  return (
    <Paper zDepth={2} style={{ width: props.width || '800px' }}>
      <Subheader style={styles.subheader}>{props.title}
        { props.onRefreshClick ?
          <IconButton
            iconStyle={styles.smallIcon}
            style={styles.small}
            onClick={props.onRefreshClick}
          >
            <RefreshIcon color={white} />
          </IconButton>
        : null }
      </Subheader>
      <Divider />
      {props.children}
    </Paper>
  );
}

ComponentHeader.propTypes = {
  title: PropTypes.string.isRequired,
  width: PropTypes.number,
  onRefreshClick: PropTypes.func,
  children: PropTypes.node.isRequired,
};

export default ComponentHeader;
