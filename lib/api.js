var request = require('request');
var q = require('q');
var _ = require('underscore');
var querystring = require('querystring');
var info = require('debug')('tol-api:info');
var debug = require('debug')('tol-api:debug');

var api = exports = module.exports = {};

/**
 * Initializes the API Client.
 *
 * @returns void
 */
api.init = function() {
  this.tokenPromise = null;
  this.refreshToken = null;
  this.jwt = null;
  this.appName = null;
  this.orgId = null;
  this.settings = {};
  this.defaultConfiguration();
};

/**
 * Defines the default configuration for tokenEndpoint and maxLimit for API Client.
 *
 * @returns void
 */
api.defaultConfiguration = function() {
  this.set('tokenEndpoint', 'token');
  this.set('maxLimit', 500);
};

/**
 * Sets the API URL for the specified resource name.
 *
 * @param {string} resource   - The resource name to create a URL for.
 * @param {string} id         - The id to provide to the resource endpoint.
 * @param {Object} parameters - The querystring parameters to include in the request.
 *
 * @returns {string} A URL to use in a HTTP Request
 */
api.urlFor = function(resource, id, parameters) {
  var url = this.settings.url + '/' + resource;
  if (id) {
    url = url + '/' + id;
  }

  if (parameters) {
    url = url + '?' + querystring.stringify(parameters);
  }

  return url;
};

/**
 * Gets the access and refresh tokens for this client.
 *
 * @returns {Promise} A promise to return an object with a refresh_token and access_token property.
 * @throws When the refresh token could not be retrieved.
 */
api.getTokens = function() {
  var self = this;
  if (!this.tokenPromise) {
    if (this.jwt && this.appName && this.orgId) {
      this.tokenPromise = this.settings.tokenFetcher(null, this.jwt, this.appName, this.orgId).then(function(tokens) {
        tokens.jwt = self.jwt;
        return tokens;
      });
    } else {
      this.tokenPromise = this.settings.tokenFetcher(this.refreshToken);
    }

    this.tokenFetcher = this.tokenPromise.then(function(tokens){
      if (tokens.refresh_token) {
        this.refreshToken = tokens.refresh_token;
      }

      return tokens;
    }).fail(function(error) {
      self.tokenPromise = null;
      throw error;
    });
  }

  return this.tokenPromise;
};

/**
 * Sets this clients access and refresh token to the value of tokens.refresh_tokens.
 * The subtlty here is that the access token is represented as this.tokenPromise. See comment in the function for further explanation.
 *
 * @param {Object[]} tokens                 - A container for tokens
 * @param {string}   tokens[].refresh_token - The refresh token value to set.
 *
 * @returns void
 */
api.setTokens = function(tokens) {
  if (tokens.refresh_token) {
    this.refreshToken = tokens.refresh_token;
  }

  if (tokens.jwt) {
    this.jwt = tokens.jwt;
  }

  //The rest of this library always calls api.getTokens().then() so we have to mock a promise so the call to .then() works.
  //q.fulfill creates a promise in the fulfilled state so it responds instantly to the .then() call.
  this.tokenPromise = q.fulfill(tokens);
};

/**
 * Sets this clients jwt which can be used to get a new access_token
 *
 * @param {string} jwt - The jwt to set
 *
 * @returns void
 */
api.setJwt = function(jwt) {
  this.jwt = jwt
};

/**
 * Sets this clients jwt app name which can be used to get a new access_token depending on app
 *
 * @param {string} appName - The app name to set
 *
 * @returns void
 */
api.setAppName = function(appName) {
  this.appName = appName
};

/**
 * Sets this clients jwt org id which can be used to get a new access_token depending on org
 *
 * @param {string} orgId - The org id to set
 *
 * @returns void
 */
api.setOrgId = function(orgId) {
  this.orgId = orgId
};

/**
 * sends a GET request to the resource specified.
 *
 * @param {string} resource   - The resource name to use.
 * @param {string} id         - The id to be provided toteh resource endpoint.
 * @param {Object} parameters - The query string parameters to use in the request.
 *
 * @returns {Object} The item with the specified id.
 */
api.get = function(resource, id, parameters) {
  var deferred = q.defer();
  if (!id) {
    deferred.reject({error: {message: "An id is required"}});
    return deferred.promise;
  }

  return this.getTokens().then(_.bind(function(tokens) {
    var req = {url: this.urlFor(resource, id, parameters), headers: {'Authorization': 'Bearer ' + tokens.access_token}, json: true};

    info("GET %s", req.url);

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};

/**
 * Gets an item from the resource where id = the item's id.
 *
 * @param {string} resource   - The resource name to use.
 * @param {string} id         - A unique identifier for the resource specified.
 * @param {Object} parameters - The query string parameters to use in the request.
 *
 * @returns {Object[]} An array containing only the result body.
 */
api.getResult = function(resource, id, parameters) {
  return this.get(resource, id, parameters).get('body').get('result');
};


/**
 * Indexes the items for the specified resource.
 *
 * @param {string} resource   - The name of the resource to send the request to.
 * @Param {Object} parameters - The query string parameters to include with the request.
 *
 * @returns {Object} an array of items for the specified resource.
 */
api.index = function(resource, parameters) {
  return this.getTokens().then(_.bind(function(tokens) {
    var deferred = q.defer();
    var req = {url: this.urlFor(resource, null, parameters), headers: {'Authorization': 'Bearer ' + tokens.access_token}, json: true};

    info("GET %s", req.url);

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};


/**
 * Indexes all of the items for the specified resource.
 *
 * @param {string} resource   - The name of the resource to send the request to.
 * @param {Object} parameters - The query string parameters to include with the request.
 */
api.indexAll = function(resource, parameters) {
  var promises = [];
  promises.push(this.index(resource, _.extend({}, parameters, {offset: 0, limit: this.settings.maxLimit})));
  return promises[0].then(_.bind(function(firstPage) {
    for (var offset = this.settings.maxLimit; offset < firstPage.body.pagination.total; offset += this.settings.maxLimit) {
      promises.push(this.index(resource, _.extend({}, parameters, {offset: offset, limit: this.settings.maxLimit})));
    }

    return q.all(promises).then(function(pages) {
      return _.flatten(_.pluck(_.pluck(pages, 'body'), 'result'), true);
    });
  }, this));
};

/**
 * Creates an item for the specified resource from the provided parameters.
 *
 * @param {string} resource   - The resource name the item is being created with.
 * @param {Object} parameters - The body of the request containing the details of the item to be created.
 *
 * @returns {Promise} A Promise to return an object containing the id for the resource created.
 */
api.post = function(resource, parameters) {
  var deferred = q.defer();

  return this.getTokens().then(_.bind(function(tokens) {
    var req = {
      url: this.urlFor(resource),
      method: 'POST',
      json: parameters,
      headers: {'Authorization': 'Bearer ' + tokens.access_token}
    };

    info("POST %s", req.url);
    debug("POST data: ", parameters);

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

/**
 * Updates the item with the specifed id for the given resource.
 *
 * @param {string} resource   - The resource name to up update the item.
 * @param {string} id         - The unique identifier of the item to be updated.
 * @param {Object} parameters - The information to update the item with.
 *
 * @returns {Promise} A Promise to return an object confirming the item was updated.
 */
api.put = function(resource, id, parameters) {
  var deferred = q.defer();

  return this.getTokens().then(_.bind(function(tokens) {
    var req = {
      url: this.urlFor(resource, id),
      method: 'PUT',
      json: parameters,
      headers: {'Authorization': 'Bearer ' + tokens.access_token}
    };

    info("PUT %s", req.url);
    debug("PUT data: ", parameters);

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

/**
 * Deletes the item with the specified id from the given resource.
 *
 * @param {string} resource - The resource name to send the request to.
 * @param {string} id       - The unique identifier for the item to be deleted.
 *
 * @returns {Promise} A Promise to return an object confirming the item was deleted.
 */
api.delete = function(resource, id) {
  var deferred = q.defer();

  return this.getTokens().then(_.bind(function(tokens) {
    var req = {
      url: this.urlFor(resource, id),
      method: 'DELETE',
      headers: {'Authorization': 'Bearer ' + tokens.access_token}
    };

    info("DELETE %s", req.url);

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

/**
 * Deletes from the API by a set of params and not an id.
 *
 * @param {string} resource - The resource name to send the request to.
 * @param {Object} parameters - The information to delete with.
 *
 * @returns {Promise} A Promise to return an object confirming the item was deleted.
 */
api.deleteByParams = function(resource, parameters) {
  var deferred = q.defer();

  return this.getTokens().then(_.bind(function(tokens) {
    var req = {
      url: this.urlFor(resource),
      method: 'DELETE',
      json: parameters,
      headers: {'Authorization': 'Bearer ' + tokens.access_token}
    };

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

/**
 * Creates and adds a setting with the specified value to the collection of settings. If value is blank the setting is added with no value.
 *
 * @param {string} setting - The Name of the field to add as a setting.
 * @param {string} value   - The value to assign to the new setting field
 *
 * @returns {Object} returns itself.
 */
api.set = function(setting, value) {
  if (arguments.length == 1) {
    return this.settings[setting];
  }

  this.settings[setting] = value;
  return this;
};

/**
 * Wrapper function to send a request to the API. This handles refreshing tokens and making the requests again in the event of a 403.
 */
function resolveResponse(deferred, api, req) {
  return function(error, res, body) {
    if (error) {
      deferred.reject(error);
    } else if (api && req && isExpiredToken(res, body)) {
      api.tokenPromise = null;
      api.getTokens().then(_.bind(function(tokens) {
        req.headers.Authorization = 'Bearer ' + tokens.access_token;
        request(req, resolveResponse(deferred, api, req));
      }, api), function(error) {
        deferred.reject({res: error.res, body: error.body});
      });
    } else if (res.statusCode >= 400) {
      deferred.reject({res: res, body: body});
    } else {
      deferred.resolve({res: res, body: body});
    }
  };
}

function isExpiredToken(res, body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return false;
    }
  }

  return res.statusCode == 401 && body.error === 'invalid_grant';
}

/**
 * Gets the access token for the specified client id and secret.
 *
 * @param {string} tokenUrl    - The URL to send token request to.
 * @param {string} clientId    - The client Id to use when requesting a token.
 * @param {string} clientSecret - The client secret to use when requesting a token.
 *
 * @returns {Promise} A Promise to return a valid access token.
 */
api.getClientCredentialsToken = function(tokenUrl, clientId, clientSecret) {
  var deferred = q.defer();

  request(
    {
      url: tokenUrl,
      method: 'POST',
      form: {grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret},
      json: true
    },
    resolveResponse(deferred)
  );

  return deferred.promise.then(parseTokenResponse);
};

/**
 * Uses the jwt to get an access token
 *
 * @param {string} tokenUrl     - The URL to send token request to.
 * @param {string} clientId     - The client Id to use when requesting a token.
 * @param {string} clientSecret - The client secret to use when requesting a token.
 * @param {string} scope        - The scope being requested for the access token.
 * @param {string} jwt          - The jwt to use when requesting a token.
 *
 * @returns {Promise} A promise to return a new access token.
 */
api.handleJwt = function(tokenUrl, clientId, clientSecret, scope, jwt, appName, orgId) {
  var deferred = q.defer();

  var form = {grant_type: 'jwt', client_id: clientId, client_secret: clientSecret, app_name: appName, org_id: orgId};
  if (scope !== undefined) {
    form.scope = scope;
  }

  request({url: tokenUrl, method: 'POST', form: form, json: true, headers: {Authorization: 'Bearer ' + jwt}}, resolveResponse(deferred));

  return deferred.promise.then(parseTokenResponse);
};

/**
 * New generic access token by scope.
 *
 * @param {string} tokenUrl     - The URL to send token request to.
 * @param {string} clientId     - The client Id to use when requesting a token.
 * @param {string} clientSecret - The client secret to use when requesting a token.
 * @param {string} scope        - The scope being requested for the access token.
 *
 * @returns {Promise} A promise to return a new access token.
 */
api.handleGenericTokenWithScope = function(tokenUrl, clientId, clientSecret, scope) {
  var deferred = q.defer();

  var form = {grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret};
  if (scope !== undefined) {
    form.scope = scope;
  }

  request({url: tokenUrl, method: 'POST', form: form, json: true}, resolveResponse(deferred));

  return deferred.promise.then(parseTokenResponse);
};

/**
 * Refreshes the access token.
 *
 * @param {string} tokenUrl     - The URL to send token request to.
 * @param {string} clientId     - The client Id to use when requesting a token.
 * @param {string} clientSecret - The client secret to use when requesting a token.
 * @param {string} scope        - The scope being requested for the access token.
 * @param {string} refreshToken - The refreshToken to use when requesting a token.
 *
 * @returns {Promise} A promise to return a new access token.
 */
api.handleRefreshToken = function(tokenUrl, clientId, clientSecret, scope, refreshToken) {
  var deferred = q.defer();

  var form = {grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken};
  if (scope !== undefined) {
    form.scope = scope;
  }

  request({url: tokenUrl, method: 'POST', form: form, json: true}, resolveResponse(deferred));

  return deferred.promise.then(parseTokenResponse);
};

/**
 * Gets an access token for the client as a specified user.
 *
 * @param {string} tokenUrl     - The URL to send token request to.
 * @param {string} clientId     - The client Id to use when requesting a token.
 * @param {string} clientSecret - The client secret to use when requesting a token.
 * @param {string} username     - The username used when requesting a token.
 * @param {string} password     - The password to use when requesting a token.
 * @param {string} scope        - The scope being requested for the access token.
 * @param {object} extra        - Any extra information you would like to pass to the tokens controller.
 *
 * @returns {Promise} A promise to return an access token for the user specified.
 */
api.getResourceOwnerPasswordCredentialsToken = function(tokenUrl, clientId, clientSecret, username, password, scope, extra) {
  var deferred = q.defer();

  var form = {grant_type: 'password', client_id: clientId, client_secret: clientSecret, username: username, password: password};

  if (extra) {
    _.extend(form, extra);
  }

  if (scope !== undefined) {
    form.scope = scope;
  }

  request(
    {
      url: tokenUrl,
      method: 'POST',
      form: form,
      json: true
    },
    resolveResponse(deferred)
  );

  return deferred.promise.then(parseTokenResponse);
};

function parseTokenResponse(res) {
  if (res.body.access_token) {
    var tokens = {access_token: res.body.access_token};
    if (res.body.refresh_token) {
      tokens.refresh_token = res.body.refresh_token;
    }

    return tokens;
  } else {
    throw { error: "Invalid response: " + res.body }
  }
}
