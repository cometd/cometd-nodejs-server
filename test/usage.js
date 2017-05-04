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

    it('notifies /meta/handshake listener', function(done) {
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

    it('notifies broadcast channel listener', function(done) {
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

    it('records subscription', function(done) {
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

    it('receives server-side publish via /meta/connect', function(done) {
        var channelName = '/hua';
        _client.handshake(function(hs) {
            if (hs.successful) {
                var session = _cometd.getServerSession(hs.clientId);
                session.addListener('suspended', function() {
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

    it('invokes handshake policy', function(done) {
        _cometd.policy = {
            canHandshake: function(session, message, callback) {
                callback(null, message.credentials);
            }
        };

        // Try without authentication fields.
        _client.handshake({}, function(hs1) {
            assert.strictEqual(hs1.successful, false);
            assert.ok(hs1.advice);
            assert.strictEqual(hs1.advice.reconnect, 'none');

            // Try with authentication fields.
            setTimeout(function() {
                _client.handshake({
                    credentials: 'secret'
                }, function(hs2) {
                    assert.strictEqual(hs2.successful, true);
                    _client.disconnect(function() {
                        done();
                    });
                });
            }, 0);
        });
    });

    it('provides access to HTTP context', function(done) {
        var channelName = '/service/kal';
        _cometd.createServerChannel(channelName).addListener('message', function(session, channel, message, callback) {
            assert.ok(_cometd.context.request);
            assert.ok(_cometd.context.response);
            session.deliver(null, channelName, message.data);
            callback();
        });

        _client.addListener(channelName, function() {
            done();
        });

        _client.handshake(function(hs) {
            if (hs.successful) {
                _client.publish(channelName, 'luz');
            }
        });
    });
});
