import React from 'react';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import BalanceList from '../components/BalanceList';

const contentStyle = {
  marginLeft: '210px',
  marginTop: '6px',
};

const AppPortfolio = () => (
  <div>
    <DrawerSidebar defaultPage="portfolio" />
    <NavBar />
    <div style={contentStyle}>
      <BalanceList />
    </div>
  </div>
);

export default AppPortfolio;
