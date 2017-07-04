## The CometD Project

### CometD NodeJS Server

Server side APIs and implementation of the Bayeux Protocol for the NodeJS environment.

### NPM Installation

```
npm install cometd-nodejs-server
```

### Minimal Setup

```javascript
var http = require('http');

var cometd = require('cometd-nodejs-server');
var cometdServer = cometd.createCometDServer();

var httpServer = http.createServer(cometdServer.handle);
httpServer.listen(0, 'localhost', function() {
    // Your application code here.
});
```

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
