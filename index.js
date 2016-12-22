var api = require('./lib/api');
var _ = require('underscore');

/**
 * Creates an API client with the specified url, client ID, and Client secret.
 *
 * @param {string} apiUrl       The url to send API requests to. '/v and the version number you wish to use.
 * @param {string} clientId     The client id to use for authentication.
 * @param {string} clientSecret The client secret to use during authentication.
 *
 * @returns {client} The Api Client to use for making requests to the TOL API.
 */
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
  getResourceOwnerPasswordCredentialsToken: api.getResourceOwnerPasswordCredentialsToken,
  handleRefreshToken: api.handleRefreshToken
};
