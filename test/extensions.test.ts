/*
 * Copyright (c) 2020 the original author or authors.
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
import * as clientLib from 'cometd';
import {Latch} from './latch';
import {AddressInfo} from 'net';

require('cometd-nodejs-client').adapt();

describe('extensions', () => {
    let _server: serverLib.CometDServer;
    let _http: http.Server;
    let _client: clientLib.CometD;
    let _uri: string;

    beforeEach(done => {
        _server = serverLib.createCometDServer();
        _http = http.createServer(_server.handle);
        _http.listen(0, 'localhost', () => {
            let port = (_http.address() as AddressInfo).port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            _client = new clientLib.CometD();
            _client.unregisterTransport('websocket');
            _client.configure({
                url: _uri
            });
            done();
        });
    });

    afterEach(() => {
        _http.close();
        _server.close();
    });

    it('calls extension.incoming', done => {
        let latch = new Latch(3, done);
        _server.addExtension({
            incoming: (cometd, session, message, callback) => {
                latch.signal();
                session.addExtension({
                    incoming: (session, message, callback) => {
                        latch.signal();
                        callback(undefined, true);
                    }
                });
                callback(undefined, true);
            }
        });

        _client.handshake(hs => {
            if (hs.successful) {
                _client.disconnect();
                latch.signal();
            }
        });
    });

    it('deletes message from server extension', done => {
        _server.addExtension({
            incoming: (cometd, session, message, callback) => {
                if (message.channel === '/meta/handshake') {
                    const reply = message.reply;
                    let advice = reply?.advice || {};
                    // @ts-ignore
                    reply.advice = advice;
                    advice.reconnect = 'none';
                    callback(undefined, false);
                } else {
                    callback(undefined, true);
                }
            }
        });

        _client.handshake(hs => {
            assert.strictEqual(hs.successful, false);
            assert.ok(hs.error);
            assert(hs.error.indexOf('message_deleted') > 0);
            done();
        });
    });

    it('deletes message from session extension', done => {
        _server.addExtension({
            incoming: (cometd, session, message, callback) => {
                session.addExtension({
                    incoming: (session, message, callback) => {
                        if (message.channel === '/meta/handshake') {
                            let reply = message.reply;
                            let advice = reply?.advice || {};
                            // @ts-ignore
                            reply.advice = advice;
                            advice.reconnect = 'none';
                            callback(undefined, false);
                        } else {
                            callback(undefined, true);
                        }
                    }
                });
                callback(undefined, true);
            }
        });

        _client.handshake(hs => {
            assert.strictEqual(hs.successful, false);
            assert.ok(hs.error);
            assert(hs.error.indexOf('message_deleted') > 0);
            done();
        });
    });

    it('calls extension.outgoing in reverse order', done => {
        let counter = 0;
        _server.addExtension({
            incoming: (cometd, session, message, callback) => {
                if (counter === 0) {
                    counter = 1;
                    session.addExtension({
                        incoming: (session, message, callback) => {
                            if (counter === 2) {
                                counter = 3;
                                callback(undefined, true);
                            } else {
                                callback(new Error('' + counter));
                            }
                        },
                        outgoing: (sender, session, message, callback) => {
                            if (counter === 7) {
                                counter = 8;
                                callback(undefined, message);
                            } else {
                                callback(new Error('' + counter));
                            }
                        }
                    });
                    callback(undefined, true);
                } else {
                    callback(new Error('' + counter));
                }
            },
            outgoing: (cometd, sender, session, message, callback) => {
                if (counter === 5) {
                    counter = 6;
                    callback(undefined, true);
                } else {
                    callback(new Error('' + counter));
                }
            }
        });
        _server.addExtension({
            incoming: (cometd, session, message, callback) => {
                if (counter === 1) {
                    counter = 2;
                    session.addExtension({
                        incoming: (session, message, callback) => {
                            if (counter === 3) {
                                counter = 4;
                                callback(undefined, true);
                            } else {
                                callback(new Error('' + counter));
                            }
                        },
                        outgoing: (sender, session, message, callback) => {
                            if (counter === 6) {
                                counter = 7;
                                callback(undefined, message);
                            } else {
                                callback(new Error('' + counter));
                            }
                        }
                    });
                    callback(undefined, true);
                } else {
                    callback(new Error('' + counter));
                }
            },
            outgoing: (cometd, sender, session, message, callback) => {
                if (counter === 4) {
                    counter = 5;
                    callback(undefined, true);
                } else {
                    callback(new Error('' + counter));
                }
            }
        });

        _client.handshake(hs => {
            assert.strictEqual(hs.successful, true);
            assert.strictEqual(counter, 8);
            _client.disconnect();
            done();
        });
    });
});
