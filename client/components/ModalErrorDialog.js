import React from 'react';
import PropTypes from 'prop-types';

import Dialog from 'material-ui/Dialog';

const ModalErrorDialog = props => (
  <div>
    <Dialog
      title={props.title}
      open={props.open}
      modal
    >
      {props.errorMessage}
    </Dialog>
  </div>
);

ModalErrorDialog.propTypes = {
  title: PropTypes.string.isRequired,
  errorMessage: PropTypes.string.isRequired,
  open: PropTypes.bool,
};

export default ModalErrorDialog;
