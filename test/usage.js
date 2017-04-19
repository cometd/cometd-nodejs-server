var http = require('http');
var assert = require('assert');
var cometd = require('..');
require('cometd-nodejs-client').adapt();
var clientLib = require('cometd');

describe('usage', function() {
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

    it('/meta/handshake listener notified', function(done) {
        var metaHandshake = _cometd.getServerChannel('/meta/handshake');
        metaHandshake.addListener('message', function(session, channel, message, callback) {
            assert.ok(session.id);
            assert.strictEqual(channel.name, '/meta/handshake');
            assert.strictEqual(message.channel, '/meta/handshake');
            callback();
        });

        _client.handshake(function(reply) {
            assert.strictEqual(reply.successful, true);
            _client.disconnect(function() {
                done();
            });
        });
    });

    it('broadcast channel listener notified', function(done) {
        var channelName = '/foo';
        var broadcast = _cometd.createServerChannel(channelName);
        broadcast.addListener('message', function(session, channel, message, callback) {
            assert.ok(session.id);
            assert.strictEqual(channel.name, channelName);
            assert.strictEqual(message.channel, channelName);
            assert.ok(message.data);
            callback();
        });

        _client.handshake(function(reply) {
            if (reply.successful) {
                _client.publish(channelName, 'data', function(msgReply) {
                    if (msgReply.successful) {
                        _client.disconnect(function() {
                            done();
                        });
                    }
                });
            }
        });
    });

    it('subscription is recorded', function(done) {
        var channelName = '/bar';
        _client.handshake(function(reply) {
            if (reply.successful) {
                _client.subscribe(channelName, function(msg) {
                }, function(r) {
                    if (r.successful) {
                        var channel = _cometd.getServerChannel(channelName);
                        assert.ok(channel);
                        var subscribers = channel.subscribers;
                        assert.strictEqual(subscribers.length, 1);
                        var subscriptions = subscribers[0].subscriptions;
                        assert.strictEqual(subscriptions.length, 1);
                        assert.strictEqual(channel, subscriptions[0]);
                        _client.disconnect(function() {
                            done();
                        });
                    }
                });
            }
        });
    });

    it('delivers server-side message without outstanding /meta/connect', function(done) {
        var channelName = '/baz';
        _client.addListener(channelName, function(msg) {
            assert.ok(msg.data);
            _client.disconnect(function() {
                done();
            });
        });

        _client.handshake(function(reply) {
            if (reply.successful) {
                var session = _cometd.getServerSession(reply.clientId);
                // The /meta/connect did not leave the client yet,
                // so here we call deliver() and message will be queued;
                // when the /meta/connect arrives on server the message
                // will be delivered to the client.
                session.deliver(null, channelName, 'data');
            }
        });
    });

    it('publishes server-side message', function(done) {
        var channelName = "/fuz";
        _client.handshake(function(hs) {
            if (hs.successful) {
                _client.subscribe(channelName, function(msg) {
                    assert.ok(msg.data);
                    _client.disconnect(function() {
                        done();
                    });
                }, function(ss) {
                    if (ss.successful) {
                        _cometd.getServerChannel(channelName).publish(null, 'data');
                    }
                });
            }
        });
    });

    it('publishes client-side message', function(done) {
        var channelName = '/gah';
        _client.handshake(function(hs) {
            if (hs.successful) {
                _client.subscribe(channelName, function(msg) {
                    assert.strictEqual(msg.reply, undefined);
                    assert.ok(msg.data);
                    _client.disconnect(function() {
                        done();
                    });
                }, function(ss) {
                    if (ss.successful) {
                        _client.publish(channelName, 'data');
                    }
                });
            }
        });
    });

    it('server-side publish is received via /meta/connect', function(done) {
        var channelName = '/hua';
        _client.handshake(function(hs) {
            if (hs.successful) {
                var session = _cometd.getServerSession(hs.clientId);
                session.addListener('suspend', function() {
                    _cometd.getServerChannel(channelName).publish(null, 'data');
                });
                _client.subscribe(channelName, function(msg) {
                    assert.ok(msg.data);
                    _client.disconnect(function() {
                        done();
                    });
                });
            }
        });
    });

    it.only('sweeps channels', function(done) {
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
    })
});
