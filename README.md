## The CometD Project

### CometD server for NodeJS

Server side APIs and implementation of the Bayeux Protocol for the NodeJS environment.

### NPM Installation

```
npm install cometd-nodejs-server
```

### Usage

```javascript
var http = require('http');

var cometd = require('cometd-nodejs-server');
var cometdServer = cometd.createCometDServer();

var httpServer = http.createServer(cometdServer.handle);
httpServer.listen(0, 'localhost', function() {
    // Receives messages on the /service/chat channel.
    cometdServer.createServerChannel('/service/chat').addListener('message', function(session, channel, message, callback) {
        // Broadcast the message data to subscribers of the /chat channel.
        cometdServer.createServerChannel('/chat').publish(session, message.data, callback);
    });
});
```
