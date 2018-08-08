// see: https://reactjs.org/docs/error-boundaries.html
import React from 'react';
import PropTypes from 'prop-types';

export default class GenericErrorBoundary extends React.Component {
  static propTypes = {
    children: PropTypes.node.isRequired,
  };

  state = {
    hasError: false,
  };

  // TODO if you want to do something with the inputs -- ommitted until needed for eslint
  // componentDidCatch(error, info) {
  componentDidCatch() {
    this.setState({ hasError: true });

    // TODO - log server-side error with details
  }

  render() {
    if (this.state.hasError) {
      return <h1>Unexpected error. Sorry about that.</h1>;
    }

    return this.props.children;
  }
}
