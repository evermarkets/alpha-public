// See feathers-reduxify-services::default
export const mapServicePathsToNames = {
  // TODO(AustinC): is this really necessary?
  orders: 'orders',
  products: 'products',
  config: 'config',
};

// See feathers-reduxify-services::getServicesStatus. Order highest priority msg first.
export const prioritizedListServices = [
  'orders', 'products'];
