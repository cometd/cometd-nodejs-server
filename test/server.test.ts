/*
 * Copyright (c) 2017 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as assert from 'assert';
import * as http from 'http';
import * as serverLib from '..';
import * as url from 'url';
import {Latch} from './latch';
import {AddressInfo} from 'net';

describe('server', () => {
    let _server: serverLib.CometDServer;
    let _http: http.Server;
    let _uri: string;

    beforeEach(done => {
        _server = serverLib.createCometDServer();
        _http = http.createServer(_server.handle);
        _http.listen(0, 'localhost', () => {
            const port = (_http.address() as AddressInfo).port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            done();
        });
    });

    afterEach(() => {
        _http.close();
        _server.close();
    });

    function newRequest(headers?: any) {
        // Could not find a way to make it work with TypeScript.
        const request = url.parse(_uri) as any;
        request.method = 'POST';
        request.agent = new http.Agent({
            keepAlive: true
        });
        request.headers = headers || {};
        return request;
    }

    function receiveResponseWithStatus(response: http.IncomingMessage, status: number, callback: (replies: any[]) => void) {
        assert.strictEqual(response.statusCode, status);
        let json = '';
        response.on('data', chunk => {
            json += chunk;
        });
        response.on('end', () => {
            if (json) {
                callback(JSON.parse(json));
            } else {
                callback([]);
            }
        });
    }

    function receiveResponse(response: http.IncomingMessage, callback: (replies: any[]) => void) {
        receiveResponseWithStatus(response, 200, callback);
    }

    function extractBrowserCookie(response: http.IncomingMessage) {
        const headers = response.headers;
        for (let name in headers) {
            if (headers.hasOwnProperty(name)) {
                if (/^set-cookie$/i.test(name)) {
                    const values = headers[name] || [];
                    for (let i = 0; i < values.length; ++i) {
                        const header = values[i];
                        const parts = header.split(';');
                        for (let j = 0; j < parts.length; ++j) {
                            const nameValue = parts[j].split('=');
                            if (nameValue.length === 2) {
                                if (nameValue[0] === 'BAYEUX_BROWSER') {
                                    return nameValue[1];
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    it('does not accept GET method', done => {
        const request = newRequest();
        request.method = 'GET';
        http.request(request, response => {
            assert.strictEqual(response.statusCode, 400);
            done();
        }).end();
    });

    it('does not accept non-JSON content', done => {
        http.request(newRequest(), response => {
            assert.strictEqual(response.statusCode, 400);
            done();
        }).end('a');
    });

    it('yields unknown session on bad first message', done => {
        http.request(newRequest(), response => {
            receiveResponse(response, replies => {
                assert.strictEqual(replies.length, 1);
                const reply = replies[0];
                assert.strictEqual(reply.successful, false);
                assert.ok(/^402::/.test(reply.error));
                done();
            });
        }).end('[{}]');
    });

    it('replies to /meta/handshake message', done => {
        http.request(newRequest(), response => {
            receiveResponse(response, replies => {
                assert.strictEqual(replies.length, 1);
                const reply = replies[0];
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

    it('replies to /meta/connect message', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const connect = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
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

    it('replies to /meta/subscribe message', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const subscribe = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(subscribe, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
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

    it('replies to /meta/unsubscribe message', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const unsubscribe = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(unsubscribe, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
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

    it('replies to /meta/disconnect message', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const disconnect = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(disconnect, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
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

    it('holds /meta/connect', function(done) {
        const timeout = 2000;
        _server.options.timeout = timeout;
        this.timeout(2 * timeout);

        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const connect1 = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect1, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const connect2 = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        const start = Date.now();
                        http.request(connect2, r3 => {
                            receiveResponse(r3, replies3 => {
                                const reply3 = replies3[0];
                                assert.strictEqual(reply3.successful, true);
                                const elapsed = Date.now() - start;
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
        _server.options.sweepPeriod = 500;
        const maxInterval = 1000;
        _server.options.maxInterval = maxInterval;
        this.timeout(3 * maxInterval);

        http.request(newRequest(), response => {
            receiveResponse(response, replies => {
                assert.strictEqual(replies.length, 1);
                const reply = replies[0];
                assert.strictEqual(reply.successful, true);
                const session = _server.getServerSession(reply.clientId);
                session.addListener('removed', (s, timeout) => {
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
        _server.options.sweepPeriod = 500;
        const maxInterval = 1000;
        _server.options.maxInterval = maxInterval;
        this.timeout(3 * maxInterval);

        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const connect = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const session = _server.getServerSession(sessionId);
                        session.addListener('removed', (s, timeout) => {
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

    it('holds /meta/connect when another request is being processed', function(done) {
        const timeout = 2000;
        _server.options.timeout = timeout;
        this.timeout(2 * timeout);

        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const connect1 = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect1, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const channelName = '/baz';
                        _server.createServerChannel(channelName).addListener('message', (session, channel, message, callback) => {
                            // Put a message in the session queue.
                            session.deliver(null, channelName, 'hello2');
                            // Finish the processing of this message when the /meta/connect is suspended.
                            session.addListener('suspended', () => {
                                callback();
                            });
                            // Send the /meta/connect that must be held,
                            // even if there are messages in the queue.
                            const connect2 = newRequest({
                                Cookie: 'BAYEUX_BROWSER=' + cookie
                            });
                            const start = Date.now();
                            http.request(connect2, r4 => {
                                receiveResponse(r4, replies4 => {
                                    const reply4 = replies4[0];
                                    assert.strictEqual(reply4.successful, true);
                                    const elapsed = Date.now() - start;
                                    assert(elapsed > timeout / 2);
                                    done();
                                });
                            }).end('[{' +
                                '"channel": "/meta/connect",' +
                                '"clientId": "' + sessionId + '",' +
                                '"connectionType": "long-polling"' +
                                '}]');
                        });
                        const publish = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        http.request(publish, r3 => {
                            receiveResponse(r3, replies3 => {
                                assert.strictEqual(replies3.length, 2);
                            });
                        }).end('[{' +
                            '"channel": "' + channelName + '",' +
                            '"clientId": "' + sessionId + '",' +
                            '"data": "hello1"' +
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

    it('holds /meta/connect when another request arrives', function(done) {
        const timeout = 2000;
        _server.options.timeout = timeout;
        this.timeout(2 * timeout);
        // _cometd.options.logLevel = 'debug';

        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const connect1 = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect1, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const channelName = '/baz';
                        _server.createServerChannel(channelName).addListener('message', (session, channel, message, callback) => {
                            // Put a message in the session queue.
                            session.deliver(null, channelName, 'hello2');
                            callback();
                        });

                        // When the /meta/connect is suspended, send the other request.
                        _server.getServerSession(sessionId).addListener('suspended', () => {
                            const publish = newRequest({
                                Cookie: 'BAYEUX_BROWSER=' + cookie
                            });
                            http.request(publish, r4 => {
                                receiveResponse(r4, replies4 => {
                                    assert.strictEqual(replies4.length, 2);
                                });
                            }).end('[{' +
                                '"channel": "' + channelName + '",' +
                                '"clientId": "' + sessionId + '",' +
                                '"data": "hello1"' +
                                '}]');
                        });

                        // Send the /meta/connect that will be held.
                        const connect2 = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        const start = Date.now();
                        http.request(connect2, r3 => {
                            receiveResponse(r3, replies3 => {
                                const reply3 = replies3[0];
                                assert.strictEqual(reply3.successful, true);
                                const elapsed = Date.now() - start;
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

    it('handles body already read', done => {
        // Replace the handler.
        _http.removeListener('request', _server.handle);
        _http.addListener('request', (request, response) => {
            let content = '';
            request.addListener('data', (chunk: any) => {
                content += chunk;
            });
            request.addListener('end', () => {
                (request as any).body = JSON.parse(content);
                _server.handle(request, response);
            });
        });

        http.request(newRequest(), r => {
            receiveResponse(r, replies => {
                const reply = replies[0];
                assert.strictEqual(reply.successful, true);
                done();
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('handles client close on held /meta/connect', function(done) {
        _server.options.timeout = 1000;
        _server.options.sweepPeriod = 500;
        const maxInterval = 1000;
        _server.options.maxInterval = maxInterval;
        this.timeout(3 * maxInterval);

        const latch = new Latch(2, done);
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;

                const session = _server.getServerSession(sessionId);
                session.addListener('removed', (s, timeout) => {
                    assert.strictEqual(s, session);
                    assert.strictEqual(timeout, true);
                    latch.signal();
                });

                const cookie = extractBrowserCookie(r1);
                const connect1 = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect1, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);

                        // Send the /meta/connect that will be held, then abort it.
                        const connect2 = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        const request = http.request(connect2);

                        // The request errors because it did not receive the response.
                        request.on('error', () => {
                            latch.signal();
                        });

                        request.end('[{' +
                            '"channel": "/meta/connect",' +
                            '"clientId": "' + sessionId + '",' +
                            '"connectionType": "long-polling"' +
                            '}]', 'utf-8', () => {
                            // Force the close of the connection after sending the request.
                            request.connection?.destroy();
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

    it('responds custom HTTP code to held /meta/connect when a new /meta/connect arrives', function(done) {
        const timeout = 2000;
        _server.options.timeout = timeout;
        const httpCode = 400;
        _server.options.duplicateMetaConnectHttpResponseCode = httpCode;
        this.timeout(2 * timeout);
        // _cometd.options.logLevel = 'debug';

        http.request(newRequest(), r0 => {
            receiveResponse(r0, replies0 => {
                const hsReply = replies0[0];
                assert.strictEqual(hsReply.successful, true);
                const sessionId = hsReply.clientId;
                const cookie = extractBrowserCookie(r0);
                const connect1 = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(connect1, r1 => {
                    receiveResponse(r1, replies1 => {
                        const cnReply1 = replies1[0];
                        assert.strictEqual(cnReply1.successful, true);
                        const latch = new Latch(2, done);
                        // When the first /meta/connect is suspended, send another /meta/connect.
                        let suspended = 0;
                        _server.getServerSession(sessionId).addListener('suspended', () => {
                            if (++suspended === 1) {
                                const connect3 = newRequest({
                                    Cookie: 'BAYEUX_BROWSER=' + cookie
                                });
                                const start = Date.now();
                                http.request(connect3, r3 => {
                                    receiveResponse(r3, replies3 => {
                                        const cnReply3 = replies3[0];
                                        assert.strictEqual(cnReply3.successful, true);
                                        const elapsed = Date.now() - start;
                                        assert(elapsed > timeout / 2);
                                        latch.signal();
                                    });
                                }).end('[{' +
                                    '"id": "3",' +
                                    '"channel": "/meta/connect",' +
                                    '"clientId": "' + sessionId + '",' +
                                    '"connectionType": "long-polling"' +
                                    '}]');
                            }
                        });
                        // Send the /meta/connect that will be held.
                        const connect2 = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        http.request(connect2, r2 => {
                            receiveResponseWithStatus(r2, httpCode, () => {
                                latch.signal();
                            });
                        }).end('[{' +
                            '"id": "2",' +
                            '"channel": "/meta/connect",' +
                            '"clientId": "' + sessionId + '",' +
                            '"connectionType": "long-polling"' +
                            '}]');
                    });
                }).end('[{' +
                    '"id": "1",' +
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

    it('supports SameSite cookie attribute', done => {
        _server.options.browserCookieSameSite = 'Strict';

        http.request(newRequest(), r => {
            receiveResponse(r, replies => {
                const reply = replies[0];
                assert.strictEqual(reply.successful, true);
                const headers = r.headers;
                for (let name in headers) {
                    if (headers.hasOwnProperty(name)) {
                        if (/^set-cookie$/i.test(name)) {
                            const values = headers[name] || [];
                            for (let i = 0; i < values.length; ++i) {
                                if (values[i].indexOf('SameSite=Strict') >= 0) {
                                    done();
                                    return;
                                }
                            }
                        }
                    }
                }
                done(new Error('missing SameSite cookie attribute'));
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('resends messages when connection is broken', done => {
        const serverAck = require('../ack-extension');
        _server.addExtension(new serverAck.AcknowledgedMessagesExtension());

        const channelName = '/foo';
        http.request(newRequest(), r0 => {
            receiveResponse(r0, replies0 => {
                const hsReply = replies0[0];
                assert.strictEqual(hsReply.successful, true);
                assert.strictEqual(hsReply.ext.ack, true);
                const sessionId = hsReply.clientId;
                const cookie = extractBrowserCookie(r0);
                const subscribe = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(subscribe, r1 => {
                    receiveResponse(r1, replies1 => {
                        const reply1 = replies1[0];
                        assert.strictEqual(reply1.successful, true);
                        const connect1 = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        http.request(connect1, r2 => {
                            receiveResponse(r2, replies2 => {
                                const cnReply1 = replies2[0];
                                assert.strictEqual(cnReply1.successful, true);
                                const batch = cnReply1.ext.ack;

                                // The /meta/connect that will be held.
                                const connect2 = newRequest({
                                    Cookie: 'BAYEUX_BROWSER=' + cookie
                                });
                                const rq3 = http.request(connect2);

                                // Reconnect after we detect the connection was broken.
                                const reconnectLatch = new Latch(2, () => {
                                    const connect3 = newRequest({
                                        Cookie: 'BAYEUX_BROWSER=' + cookie
                                    });
                                    http.request(connect3, r4 => {
                                        receiveResponse(r4, replies4 => {
                                            assert.strictEqual(2, replies4.length);
                                            const message = replies4[0];
                                            assert.strictEqual(message.channel, channelName);
                                            const cnReply3 = replies4[1];
                                            assert.strictEqual(cnReply3.successful, true);
                                            done();
                                        });
                                    }).end('[{' +
                                        '"id": "5",' +
                                        '"channel": "/meta/connect",' +
                                        '"clientId": "' + sessionId + '",' +
                                        '"connectionType": "long-polling",' +
                                        '"advice": {' +
                                        '  "timeout": 0' +
                                        '},' +
                                        '"ext": {"ack": ' + batch + '}' +
                                        '}]');

                                });
                                rq3.on('error', () => reconnectLatch.signal());

                                // When the /meta/connect is suspended, break the connection and emit a message.
                                const session = _server.getServerSession(sessionId);
                                session.addListener('suspended', () => {
                                    rq3.destroy();
                                    // Emit the message on the broken connection.
                                    _server.getServerChannel(channelName).publish(null, 'data', () => reconnectLatch.signal());
                                });

                                rq3.end('[{' +
                                    '"id": "4",' +
                                    '"channel": "/meta/connect",' +
                                    '"clientId": "' + sessionId + '",' +
                                    '"connectionType": "long-polling",' +
                                    '"ext": {"ack": ' + batch + '}' +
                                    '}]');
                            });
                        }).end('[{' +
                            '"id": "3",' +
                            '"channel": "/meta/connect",' +
                            '"clientId": "' + sessionId + '",' +
                            '"connectionType": "long-polling",' +
                            '"advice": {' +
                            '  "timeout": 0' +
                            '},' +
                            '"ext": {"ack": -1}' +
                            '}]');
                    });
                }).end('[{' +
                    '"id": "2",' +
                    '"channel": "/meta/subscribe",' +
                    '"clientId": "' + sessionId + '",' +
                    '"subscription": "' + channelName + '"' +
                    '}]');
            });
        }).end('[{' +
            '"id": "1",' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"],' +
            '"ext": {"ack": true}' +
            '}]');
    });

    it('unsubscribe removes multiple subscriptions', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const subscribe = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(subscribe, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const unsubscribe = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        http.request(unsubscribe, r3 => {
                            receiveResponse(r3, replies3 => {
                                const reply3 = replies3[0];
                                assert.strictEqual(reply3.successful, true);
                                const session = _server.getServerSession(sessionId);
                                assert.ok(session);
                                const fooChannel = _server.getServerChannel('/foo');
                                assert.ok(fooChannel);
                                const barChannel = _server.getServerChannel('/bar');
                                assert.ok(barChannel);
                                assert.strictEqual(session.subscriptions.length, 0);
                                assert.strictEqual(fooChannel.subscribers.length, 0);
                                assert.strictEqual(barChannel.subscribers.length, 0);
                                done();
                            });
                        }).end('[{' +
                            '"channel": "/meta/unsubscribe",' +
                            '"clientId": "' + sessionId + '",' +
                            '"subscription": ["/foo", "/bar"]' +
                            '}]');
                    });
                }).end('[{' +
                    '"channel": "/meta/subscribe",' +
                    '"clientId": "' + sessionId + '",' +
                    '"subscription": ["/foo", "/bar"]' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });

    it('disconnect removes multiple subscriptions', done => {
        http.request(newRequest(), r1 => {
            receiveResponse(r1, replies1 => {
                const reply1 = replies1[0];
                assert.strictEqual(reply1.successful, true);
                const sessionId = reply1.clientId;
                const cookie = extractBrowserCookie(r1);
                const subscribe = newRequest({
                    Cookie: 'BAYEUX_BROWSER=' + cookie
                });
                http.request(subscribe, r2 => {
                    receiveResponse(r2, replies2 => {
                        const reply2 = replies2[0];
                        assert.strictEqual(reply2.successful, true);
                        const session = _server.getServerSession(sessionId);
                        assert.ok(session);
                        const fooChannel = _server.getServerChannel('/foo');
                        assert.ok(fooChannel);
                        const barChannel = _server.getServerChannel('/bar');
                        assert.ok(barChannel);
                        const disconnect = newRequest({
                            Cookie: 'BAYEUX_BROWSER=' + cookie
                        });
                        http.request(disconnect, r3 => {
                            receiveResponse(r3, replies3 => {
                                const reply3 = replies3[0];
                                assert.strictEqual(reply3.successful, true);
                                assert.strictEqual(session.subscriptions.length, 0);
                                assert.strictEqual(fooChannel.subscribers.length, 0);
                                assert.strictEqual(barChannel.subscribers.length, 0);
                                done();
                            });
                        }).end('[{' +
                            '"channel": "/meta/disconnect",' +
                            '"clientId": "' + sessionId + '"' +
                            '}]');
                    });
                }).end('[{' +
                    '"channel": "/meta/subscribe",' +
                    '"clientId": "' + sessionId + '",' +
                    '"subscription": ["/foo", "/bar"]' +
                    '}]');
            });
        }).end('[{' +
            '"channel": "/meta/handshake",' +
            '"version": "1.0",' +
            '"supportedConnectionTypes": ["long-polling"]' +
            '}]');
    });
});
