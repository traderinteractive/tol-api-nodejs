var api = require('./lib/api');
var _ = require('underscore');

var createClient = exports = module.exports = function(apiUrl, clientId, clientSecret) {
  var client = _.extend({}, api);
  client.init();
  client.set('url', apiUrl);
  client.set('clientId', clientId);
  client.set('clientSecret', clientSecret);

  return client;
};
