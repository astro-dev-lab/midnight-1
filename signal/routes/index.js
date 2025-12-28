/**
 * StudioOS Routes Index
 * 
 * Exports all route factories for mounting in the main application.
 */

const createProjectRoutes = require('./projects');
const createAssetRoutes = require('./assets');
const createJobRoutes = require('./jobs');
const createDeliveryRoutes = require('./deliveries');

module.exports = {
  createProjectRoutes,
  createAssetRoutes,
  createJobRoutes,
  createDeliveryRoutes
};
