## The CometD Project

### CometD NodeJS Server

Server side APIs and implementation of the Bayeux Protocol for the NodeJS environment.
WebSocket not (yet) supported.

### NPM Installation

```
npm install cometd-nodejs-server
```

### Running the tests

```
npm install mocha
npm install cometd
npm install cometd-nodejs-client
npm test
```

### Minimal Application

```javascript
var http = require('http');

var cometd = require('cometd-nodejs-server');
var cometdServer = cometd.createCometDServer();

var httpServer = http.createServer(cometdServer.handle);
httpServer.listen(0, 'localhost', function() {
    // Your application code here.
});
```

### Customizing CometD Configuration

```javascript
var cometd = require('cometd-nodejs-server');
var cometdServer = cometd.createCometDServer({
    logLevel: 'debug', // Emits logging on the console
    timeout: 10000, // Heartbeat timeout in milliseconds
    maxInterval: 15000, // Server-side session expiration in milliseconds
    ...
});

```

### Server timeout and CometD timeout

CometD clients send periodic heartbeat messages on the `/meta/connect` channel.
The CometD server holds these heartbeat messages for at most the `timeout` value
(see above), by default 30 seconds.

The NodeJS server also has a `timeout` property that controls the maximum time
to handle a request/response cycle, by default 120 seconds.

You want to be sure that NodeJS' `Server.timeout` is greater than CometD's
`CometDServer.options.timeout`, especially if you plan to increase the CometD
timeout.

### Creating Channels and Receiving Messages

```javascript
var channel = cometdServer.createServerChannel('/service/chat');
channel.addListener('message', function(session, channel, message, callback) {
    // Your message handling here.

    // Invoke the callback to signal that handling is complete.
    callback();
});
```

### Publishing Messages on a Channel

```javascript
var channel = cometdServer.createServerChannel('/chat');
channel.publish(session, message.data);
```

### Installing a Security Policy

```javascript
cometdServer.policy = {
    canHandshake: function(session, message, callback) {
        // Your handshake policy here.
        var allowed = ...;
        
        // Invoke the callback to signal the policy result. 
        callback(null, allowed);
    }
};
```

### Sending a Direct Message to a Session

```javascript
var session = cometdServer.getServerSession(sessionId);
session.deliver(null, '/service/chat', {
    text: 'lorem ipsum'
});
```

### Reacting to Session Timeout/Disconnection

```javascript 
session.addListener('removed', function(session, timeout) {
    if (timeout) {
        // Session was expired by the server.
    } else {
        // Session was explicitly disconnected.
    }
});
```
