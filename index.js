var api = require('./lib/api');
var _ = require('underscore');

var createClient = exports = module.exports = function(apiUrl, apiVersion, clientId, clientSecret) {
  var client = _.extend({}, api);
  client.init();
  client.set('url', apiUrl);
  client.set('version', apiVersion);
  client.set('clientId', clientId);
  client.set('clientSecret', clientSecret);

  return client;
};
