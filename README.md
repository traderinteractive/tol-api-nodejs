# TOL Api
A node.js API client for the TOL APIs.

###Requirements
The api client requires [q](https://github.com/kriskowal/q), [request](https://github.com/request/request), and [underscore.js](http://underscorejs.org/).

###Installation
There are 2 ways you can import this project.

1.) ```npm install dominionenterprises/tol-api-nodejs```


2.) Add the following entry to your packages.json and then run ```npm update``` (Recommended)

```json
"dependencies" :{
        "tol-api" : "https://github.com/dominionenterprises.com/tol-api-nodejs#v0.6.1"
}
```

###Usage
```nodejs
//Imports the tol-api library
var clientFactory = require('tol-api');

//Creates the api client and fetches your first access token
var client = clientFactory.createClient('https://baseApiUrl/v1', 'clientId', 'clientSecret');

client.getResult('cycles', 123456789).then(function(response) {
    console.log(response);
});
```
