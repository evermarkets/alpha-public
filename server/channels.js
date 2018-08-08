module.exports = function (app) {
  if (typeof app.channel !== 'function') {
    // if no real-time functionality has been configured, just return
    return;
  }

  app.on('connection', (connection) => {
    // on a new real-time connection, add it to the anonymous channel
    app.channel('anonymous').join(connection);
  });

  app.publish((data, hook) => // eslint-disable-line no-unused-vars
    // publish events to all users
    app.channel('anonymous'),
  );
};
