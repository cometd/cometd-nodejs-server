var http = require('http');
var assert = require('assert');
var cometd = require('..');
require('cometd-nodejs-client').adapt();
var clientLib = require('cometd');

describe('chat', function() {
    var _cometd;
    var _server;
    var _uri;

    beforeEach(function(done) {
        _cometd = cometd.createCometDServer();
        _server = http.createServer(_cometd.handle);
        _server.listen(0, 'localhost', function() {
            var port = _server.address().port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            done();
        });
    });

    afterEach(function() {
        _server.close();
        _cometd.close();
    });

    var _broadcastChannel = '/chat';
    var _serviceChannel = '/service/chat';

    it('chats', function(done) {
        var delay = 1000;
        _cometd.options.multiSessionInterval = delay;
        this.timeout(2 * delay);

        var client1 = new clientLib.CometD();
        client1.configure({
            url: _uri
        });

        var client2 = new clientLib.CometD();
        client2.configure({
            url: _uri
        });

        // The second client must handshake after the first client to avoid
        // that the server generates two different BAYEUX_BROWSER cookies.
        // The second client will be in 'multiple-clients' mode.
        client1.handshake(function(hs1) {
            if (hs1.successful) {
                client2.handshake(function(hs2) {
                    if (hs2.successful) {
                        client1.subscribe(_broadcastChannel, function(msg1) {
                            if (msg1.data.user !== 1) {
                                client1.disconnect(function() {
                                    client2.disconnect(function() {
                                        done();
                                    });
                                });
                            }
                        }, function(ss1) {
                            if (ss1.successful) {
                                client2.subscribe(_broadcastChannel, function(msg2) {
                                    if (msg2.data.user !== 2) {
                                        client2.publish(_serviceChannel, {
                                            user: 2,
                                            text: 'Hi ' + msg2.data.user + '! I am 2.'
                                        });
                                    }
                                }, function(ss2) {
                                    if (ss2.successful) {
                                        client1.publish(_serviceChannel, {
                                            user: 1,
                                            text: 'Hello!'
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

        // The service receives a service message and broadcasts it to subscribers.
        // This allows the service to analyze the message and perform business logic.
        _cometd.createServerChannel(_serviceChannel).addListener('message', function(session, channel, message, callback) {
            _cometd.getServerChannel(_broadcastChannel).publish(session, message.data, callback);
        });
    });
});
