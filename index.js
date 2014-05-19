var api = require('./lib/api');
var _ = require('underscore');

var createClient = function(apiUrl, clientId, clientSecret) {
  var client = _.extend({}, api);
  client.init();
  client.set('url', apiUrl);

  if (_.isFunction(clientId)) {
    client.set('tokenFetcher', clientId);
  } else {
    client.set('tokenFetcher', _.partial(api.getClientCredentialsToken, apiUrl + '/token', clientId, clientSecret));
  }

  return client;
};

module.exports = exports = {
  createClient: createClient,
  getClientCredentialsToken: api.getClientCredentialsToken,
  getResourceOwnerPasswordCredentialsToken: api.getResourceOwnerPasswordCredentialsToken
};
