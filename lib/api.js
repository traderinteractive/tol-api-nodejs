var request = require('request');
var q = require('q');
var _ = require('underscore');

var api = exports = module.exports = {};
var tokenPromise = null;

api.init = function() {
  this.settings = {};
  this.defaultConfiguration();
};

api.defaultConfiguration = function() {
  this.set('tokenEndpoint', 'token');
  this.set('maxLimit', 500);
};

api.urlFor = function(resource, id) {
  var url = this.settings.url + '/' + resource;
  if (id) {
    url = url + '/' + id;
  }

  return url;
};

api.getToken = function() {
  if (!tokenPromise) {
    var deferred = q.defer();
    tokenPromise = deferred.promise;

    request(
      {
        url: this.urlFor(this.settings.tokenEndpoint),
        method: 'POST',
        form: {grant_type: 'client_credentials', client_id: this.settings.clientId, client_secret: this.settings.clientSecret},
        json: true
      },
      resolveResponse(deferred)
    );
  }

  return tokenPromise.get('access_token');
};

api.get = function(resource, id, parameters) {
  var deferred = q.defer();
  if (!id) {
    deferred.reject({error: {message: "An id is required"}});
    return deferred.promise;
  }

  return this.getToken().then(_.bind(function(token) {
    var req = {url: this.urlFor(resource, id), qs: parameters, headers: {'Authorization': 'Bearer ' + token}, json: true};

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};

api.getResult = function(resource, id, parameters) {
  return this.get(resource, id, parameters).get('result');
};

api.index = function(resource, parameters) {
  return this.getToken().then(_.bind(function(token) {
    var deferred = q.defer();
    var req = {url: this.urlFor(resource), qs: parameters, headers: {'Authorization': 'Bearer ' + token}, json: true};

    request(req, resolveResponse(deferred, this, req));

    return deferred.promise;
  }, this));
};

api.indexAll = function(resource, parameters) {
  var promises = [];
  promises.push(this.index(resource, _.extend({}, parameters, {offset: 0, limit: this.settings.maxLimit})));
  return promises[0].then(_.bind(function(firstPage) {
    for (var offset = this.settings.maxLimit; offset < firstPage.pagination.total; offset += this.settings.maxLimit) {
      promises.push(this.index(resource, _.extend({}, parameters, {offset: offset, limit: this.settings.maxLimit})));
    }

    return q.all(promises).then(function(pages) {
      return _.flatten(_.pluck(pages, 'result'), true);
    });
  }, this));
};

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
      tokenPromise = null;
      api.getToken().then(_.bind(function(token) {
        req.headers.Authorization = 'Bearer ' + token;
        request(req, resolveResponse(deferred, api, req));
      }, api));
    } else if (res.statusCode != 200) {
      deferred.reject({res: res, body: body});
    } else {
      deferred.resolve(body);
    }
  };
}

function isExpiredToken(res, body) {
  return res.statusCode == 401 && body.error === 'invalid_grant';
}
