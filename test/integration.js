var http = require('http');
var assert = require('assert');
var Latch  = require('./latch.js');
var cometd = require('..');
require('cometd-nodejs-client').adapt();
var clientLib = require('cometd');

describe('integration', function() {
    var _cometd;
    var _server;
    var _client;
    var _uri;

    beforeEach(function(done) {
        _cometd = cometd.createCometDServer();
        _server = http.createServer(_cometd.handle);
        _server.listen(0, 'localhost', function() {
            var port = _server.address().port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            _client = new clientLib.CometD();
            _client.configure({
                url: _uri
            });
            done();
        });
    });

    afterEach(function() {
        _server.close();
        _cometd.close();
    });

    it('sweeps channels', function(done) {
        var period = 500;
        _cometd.options.sweepPeriod = period;
        this.timeout(5 * period);

        var channelName = '/jaz';

        _cometd.addListener('channelRemoved', function(channel) {
            assert.strictEqual(channel.name, channelName);
            done();
        });

        _client.handshake(function(hs) {
            if (hs.successful) {
                var channel = _cometd.createServerChannel(channelName);
                var listener = function() {
                    return undefined;
                };
                // Add a listener to make the channel non sweepable.
                channel.addListener('message', listener);
                // Wait for a few sweeps.
                setTimeout(function() {
                    channel = _cometd.getServerChannel(channelName);
                    assert.ok(channel);
                    // Remove the listener to make the channel sweepable.
                    channel.removeListener('message', listener);
                }, 2 * period);
            }
        });
    });

    it('handles multiple sessions', function(done) {
        var client1 = new clientLib.CometD();
        client1.configure({
            url: _uri
        });

        var client2 = new clientLib.CometD();
        client2.configure({
            url: _uri
        });

        client2.addListener('/meta/connect', function(message) {
            var advice = message.advice;
            if (advice && advice['multiple-clients']) {
                client1.disconnect(function() {
                    client2.disconnect(function() {
                        done();
                    });
                });
            }
        });

        // The second client must handshake after the first client to avoid
        // that the server generates two different BAYEUX_BROWSER cookies.
        client1.handshake(function(hs1) {
            if (hs1.successful) {
                var session = _cometd.getServerSession(hs1.clientId);
                session.addListener('suspended', function() {
                    client2.handshake();
                });
            }
        });
    });

    it('handles server-side disconnects', function(done) {
        var client = new clientLib.CometD();
        client.configure({
            url: _uri
        });

        var latch = new Latch(2, done);
        client.handshake(function(hs) {
            if (hs.successful) {
                client.addListener('/meta/disconnect', function() {
                    latch.signal();
                });

                var session = _cometd.getServerSession(client.getClientId());
                session.addListener('suspended', function() {
                    client.addListener('/meta/connect', function() {
                        latch.signal();
                    });

                    setTimeout(function() {
                        session.disconnect();
                    }, 0);
                });
            }
        });
    });
});
