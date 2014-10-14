var request = require('request');
var q = require('q');
var _ = require('underscore');
var querystring = require('querystring');

var api = exports = module.exports = {};

api.init = function() {
  this.tokenPromise = null;
  this.settings = {};
  this.defaultConfiguration();
};

api.defaultConfiguration = function() {
  this.set('tokenEndpoint', 'token');
  this.set('maxLimit', 500);
};

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

api.getToken = function() {
  this.tokenPromise = this.tokenPromise || this.settings.tokenFetcher();

  return this.tokenPromise;
};

api.get = function(resource, id, parameters) {
  var deferred = q.defer();
  if (!id) {
    deferred.reject({error: {message: "An id is required"}});
    return deferred.promise;
  }

  return this.getToken().then(_.bind(function(token) {
    var req = {url: this.urlFor(resource, id, parameters), headers: {'Authorization': 'Bearer ' + token}, json: true};

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};

api.getResult = function(resource, id, parameters) {
  return this.get(resource, id, parameters).get('body').get('result');
};

api.index = function(resource, parameters) {
  return this.getToken().then(_.bind(function(token) {
    var deferred = q.defer();
    var req = {url: this.urlFor(resource, null, parameters), headers: {'Authorization': 'Bearer ' + token}, json: true};

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};

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

api.post = function(resource, parameters) {
  var deferred = q.defer();

  return this.getToken().then(_.bind(function(token) {
    var req = {
      url: this.urlFor(resource),
      method: 'POST',
      json: parameters,
      headers: {'Authorization': 'Bearer ' + token}
    };

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

api.put = function(resource, id, parameters) {
  var deferred = q.defer();

  return this.getToken().then(_.bind(function(token) {
    var req = {
      url: this.urlFor(resource, id),
      method: 'PUT',
      json: parameters,
      headers: {'Authorization': 'Bearer ' + token}
    };

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

api.delete = function(resource, id) {
  var deferred = q.defer();

  return this.getToken().then(_.bind(function(token) {
    var req = {
      url: this.urlFor(resource, id),
      method: 'DELETE',
      headers: {'Authorization': 'Bearer ' + token}
    };

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
}

api.set = function(setting, value) {
  if (arguments.length == 1) {
    return this.settings[setting];
  }

  this.settings[setting] = value;
  return this;
};

function resolveResponse(deferred, api, req) {
  return function(error, res, body) {
    if (error) {
      deferred.reject(error);
    } else if (api && req && isExpiredToken(res, body)) {
      api.tokenPromise = null;
      api.getToken().then(_.bind(function(token) {
        req.headers.Authorization = 'Bearer ' + token;
        request(req, resolveResponse(deferred, api, req));
      }, api));
    } else if (res.statusCode >= 400) {
      deferred.reject({res: res, body: body});
    } else {
      deferred.resolve({res: res, body: body});
    }
  };
}

function isExpiredToken(res, body) {
  return res.statusCode == 401 && body.error === 'invalid_grant';
}

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

api.getResourceOwnerPasswordCredentialsToken = function(tokenUrl, clientId, clientSecret, username, password, scope) {
  var deferred = q.defer();

  var form = {grant_type: 'password', client_id: clientId, client_secret: clientSecret, username: username, password: password};
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
    return res.body.access_token;
  } else {
    throw { error: "Invalid response: " + res.body }
  }
}
