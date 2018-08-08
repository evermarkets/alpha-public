import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { Router, Route, IndexRedirect } from 'react-router';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import AppWrapper from './components/AppWrapper';
import AppPortfolio from './screens/AppPortfolio';
import AppTrade from './screens/AppTrade';
import AppOrders from './screens/AppOrders';
import AppContracts from './screens/AppContracts';
import AppManageContracts from './screens/AppManageContracts';
import AppMargin from './screens/AppMargin';
import AppManageMargin from './screens/AppManageMargin';
import AppInspector from './screens/AppInspector';
import AppDebug from './screens/AppDebug';

// Routing
export default function (store, history) {
  const muiTheme = getMuiTheme({
    palette: {
      primary1Color: '#3f6390', // "EverMarkets Blue"
    },
    appBar: {
      height: 50,
    },
  });

  ReactDOM.render(
    <MuiThemeProvider muiTheme={muiTheme}>
      <Provider store={store}>
        <Router history={history}>
          <Route path="/" component={AppWrapper}>
            <IndexRedirect to="app" />
            {/* TODO we should re-examine this section in light of this:
            https://medium.com/@pshrmn/a-simple-react-router-v4-tutorial-7f23ff27adf
            Likely improvements: use Switch, just use AppWrapper/AppPortfolio as literals */}
            <Route path="/app/trade" component={AppTrade} />
            <Route path="/app/orders" component={AppOrders} />
            <Route path="/app/contracts" component={AppContracts} />
            <Route path="/app/manageContracts" component={AppManageContracts} />
            <Route path="/app/margin" component={AppMargin} />
            <Route path="/app/manageMargin" component={AppManageMargin} />
            <Route path="/app/inspector" component={AppInspector} />
            <Route path="/app/debug" component={AppDebug} />
            <Route path="*" component={AppPortfolio} />
          </Route>
        </Router>
      </Provider>
    </MuiThemeProvider>,
    document.getElementById('root'),
  );
}
