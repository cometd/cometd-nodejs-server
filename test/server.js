var url = require('url');
var http = require('http');
var assert = require('assert');
var cometd = require('..');

describe('server', function() {
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

    function newRequest() {
        var request = url.parse(_uri);
        request.method = 'POST';
        request.agent = new http.Agent({
            keepAlive: true
        });
        request.headers = {};
        return request;
    }

    function receiveResponse(response, callback) {
        assert.strictEqual(response.statusCode, 200);
        var json = '';
        response.on('data', function(chunk) {
            json += chunk;
        });
        response.on('end', function() {
            callback(JSON.parse(json));
        });
    }

    function extractBrowserCookie(response) {
        var headers = response.headers;
        for (var name in headers) {
            if (/^set-cookie$/i.test(name)) {
                var header = headers[name];
                for (var i = 0; i < header.length; ++i) {
                    var whole = header[i];
                    var parts = whole.split(';');
                    for (var j = 0; j < parts.length; ++j) {
                        var nameValue = parts[j].split('=');
                        if (nameValue.length === 2) {
                            if (nameValue[0] === 'BAYEUX_BROWSER') {
                                return nameValue[1];
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    it('method GET not accepted', function(done) {
        var request = newRequest();
        request.method = 'GET';
        http.request(request, function(response) {
            assert.strictEqual(response.statusCode, 400);
            done();
        }).end();
    });

    it('non-JSON content not accepted', function(done) {
        http.request(newRequest(), function(response) {
            assert.strictEqual(response.statusCode, 400);
            done();
        }).end('a');
    });

    it('bad first message yields unknown session', function(done) {
        http.request(newRequest(), function(response) {
            receiveResponse(response, function(replies) {
                assert.strictEqual(replies.length, 1);
                var reply = replies[0];
                assert.strictEqual(reply.successful, false);
                assert.ok(/^402::/.test(reply.error));
                done();
            });
        }).end('[{}]');
    });

    it('/meta/handshake message is replied', function(done) {
        http.request(newRequest(), function(response) {
            receiveResponse(response, function(replies) {
                assert.strictEqual(replies.length, 1);
                var reply = replies[0];
                assert.strictEqual(reply.successful, true);
                assert.ok(reply.clientId);
                assert.ok(extractBrowserCookie(response));
                done();
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('/meta/connect message is replied', function(done) {
        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var connect = newRequest();
                connect.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(connect, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        done();
                    });
                }).end('[{' +
                    '"channel": "/meta/connect",' +
                    '"clientId": "' + sessionId + '",' +
                    '"connectionType": "long-polling",' +
                    '"advice": {' +
                    '  "timeout": 0' +
                    '}' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('/meta/subscribe message is replied', function(done) {
        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var subscribe = newRequest();
                subscribe.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(subscribe, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        done();
                    });
                }).end('[{' +
                    '"channel": "/meta/subscribe",' +
                    '"clientId": "' + sessionId + '",' +
                    '"subscription": "/foo"' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('/meta/unsubscribe message is replied', function(done) {
        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var unsubscribe = newRequest();
                unsubscribe.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(unsubscribe, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        done();
                    });
                }).end('[{' +
                    '"channel": "/meta/unsubscribe",' +
                    '"clientId": "' + sessionId + '",' +
                    '"subscription": "/foo"' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('/meta/disconnect message is replied', function(done) {
        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var disconnect = newRequest();
                disconnect.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(disconnect, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        done();
                    });
                }).end('[{' +
                    '"channel": "/meta/disconnect",' +
                    '"clientId": "' + sessionId + '"' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('/meta/connect is held', function(done) {
        var timeout = 2000;
        _cometd.options.timeout = timeout;
        this.timeout(2 * timeout);

        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var connect1 = newRequest();
                connect1.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(connect1, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        var connect2 = newRequest();
                        connect2.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                        var start = Date.now();
                        http.request(connect2, function(r3) {
                            receiveResponse(r3, function(replies3) {
                                var reply3 = replies3[0];
                                assert.strictEqual(reply3.successful, true);
                                var elapsed = Date.now() - start;
                                assert(elapsed > timeout / 2);
                                done();
                            });
                        }).end('[{' +
                            '"channel": "/meta/connect",' +
                            '"clientId": "' + sessionId + '",' +
                            '"connectionType": "long-polling"' +
                            '}]');
                    });
                }).end('[{' +
                    '"channel": "/meta/connect",' +
                    '"clientId": "' + sessionId + '",' +
                    '"connectionType": "long-polling",' +
                    '"advice": {' +
                    '  "timeout": 0' +
                    '}' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('sweeps session after /meta/handshake', function(done) {
        _cometd.options.sweepPeriod = 500;
        var maxInterval = 1000;
        _cometd.options.maxInterval = maxInterval;
        this.timeout(3 * maxInterval);

        http.request(newRequest(), function(response) {
            receiveResponse(response, function(replies) {
                assert.strictEqual(replies.length, 1);
                var reply = replies[0];
                assert.strictEqual(reply.successful, true);
                var session = _cometd.getServerSession(reply.clientId);
                session.addListener('remove', function(s, timeout) {
                    assert.strictEqual(s, session);
                    assert.strictEqual(timeout, true);
                    done();
                });
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('sweeps session after /meta/connect', function(done) {
        _cometd.options.sweepPeriod = 500;
        var maxInterval = 1000;
        _cometd.options.maxInterval = maxInterval;
        this.timeout(3 * maxInterval);

        http.request(newRequest(), function(r1) {
            receiveResponse(r1, function(replies1) {
                var reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                var sessionId = reply1.clientId;
                var cookie = extractBrowserCookie(r1);
                var connect = newRequest();
                connect.headers['Cookie'] = 'BAYEUX_BROWSER=' + cookie;
                http.request(connect, function(r2) {
                    receiveResponse(r2, function(replies2) {
                        var reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        var session = _cometd.getServerSession(sessionId);
                        session.addListener('remove', function(s, timeout) {
                            assert.strictEqual(s, session);
                            assert.strictEqual(timeout, true);
                            done();
                        });
                    });
                }).end('[{' +
                    '"channel": "/meta/connect",' +
                    '"clientId": "' + sessionId + '",' +
                    '"connectionType": "long-polling",' +
                    '"advice": {' +
                    '  "timeout": 0' +
                    '}' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });
});
