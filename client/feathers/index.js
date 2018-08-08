
/* global io, window */

import feathers from '@feathersjs/client';
import reduxifyServices, { getServicesStatus } from 'feathers-redux';

import { mapServicePathsToNames, prioritizedListServices } from './feathersServices';

const socket = io();

// Configure feathers-client
// TODO we have a high timeout for now because the chain hydration calls can take
// a while, but we should remove this once we add caching there
const app = feathers()
  .configure(feathers.socketio(socket, { timeout: 20000 }));
export default app;

// Reduxify feathers services
export const feathersServices = reduxifyServices(app, mapServicePathsToNames);

// Convenience method to get status of feathers services
export const getFeathersStatus =
  (servicesRootState, names = prioritizedListServices) =>
    getServicesStatus(servicesRootState, names);
