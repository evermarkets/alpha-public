import React from 'react';

import AppBar from 'material-ui/AppBar';
import FlatButton from 'material-ui/FlatButton'; // eslint-disable-line no-unused-vars

const NavBar = () => (
  <div>
    <AppBar
      title={
        <img
          src="/evermarkets.png"
          alt="EverMarkets Logo"
          style={{
            width: '134px',
            height: '31px',
            paddingTop: '10px',
          }}
        />
        }
      iconElementLeft={<div />}
    />
  </div>
);

export default NavBar;
