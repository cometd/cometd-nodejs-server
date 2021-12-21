/*
 * Copyright (c) 2017-2021 the original author or authors.
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
import {AddressInfo} from 'net';

require('cometd-nodejs-client').adapt();

describe('usage', () => {
    let _server: serverLib.CometDServer;
    let _http: http.Server;
    let _client: clientLib.CometD;
    let _uri: string;

    beforeEach(done => {
        _server = serverLib.createCometDServer();
        _http = http.createServer(_server.handle);
        _http.listen(0, 'localhost', () => {
            const port = (_http.address() as AddressInfo).port;
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

    it('notifies /meta/handshake listener', done => {
        const metaHandshake = _server.getServerChannel('/meta/handshake');
        metaHandshake.addListener('message', (session, channel, message, callback) => {
            assert.ok(session.id);
            assert.strictEqual(channel.name, '/meta/handshake');
            assert.strictEqual(message.channel, '/meta/handshake');
            callback();
        });

        _client.handshake(reply => {
            assert.strictEqual(reply.successful, true);
            _client.disconnect(() => {
                done();
            });
        });
    });

    it('notifies broadcast channel listener', done => {
        const channelName = '/foo';
        const broadcast = _server.createServerChannel(channelName);
        broadcast.addListener('message', (session, channel, message, callback) => {
            assert.ok(session.id);
            assert.strictEqual(channel.name, channelName);
            assert.strictEqual(message.channel, channelName);
            assert.ok(message.data);
            callback();
        });

        _client.handshake(reply => {
            if (reply.successful) {
                _client.publish(channelName, 'data', msgReply => {
                    if (msgReply.successful) {
                        _client.disconnect(() => {
                            done();
                        });
                    }
                });
            }
        });
    });

    it('records subscription', done => {
        const channelName = '/bar';
        _client.handshake(reply => {
            if (reply.successful) {
                _client.subscribe(channelName, () => {
                }, r => {
                    if (r.successful) {
                        const channel = _server.getServerChannel(channelName);
                        assert.ok(channel);
                        const subscribers = channel.subscribers;
                        assert.strictEqual(subscribers.length, 1);
                        const subscriptions = subscribers[0].subscriptions;
                        assert.strictEqual(subscriptions.length, 1);
                        assert.strictEqual(channel, subscriptions[0]);
                        _client.disconnect(() => {
                            done();
                        });
                    }
                });
            }
        });
    });

    it('delivers server-side message without outstanding /meta/connect', done => {
        const channelName = '/baz';
        _client.addListener(channelName, msg => {
            assert.ok(msg.data);
            _client.disconnect(() => {
                done();
            });
        });

        _client.handshake(reply => {
            if (reply.successful) {
                const session = _server.getServerSession(reply.clientId!);
                // The /meta/connect did not leave the client yet,
                // so here we call deliver() and message will be queued;
                // when the /meta/connect arrives on server the message
                // will be delivered to the client.
                session.deliver(null, channelName, 'data');
            }
        });
    });

    it('publishes server-side message', done => {
        const channelName = "/fuz";
        _client.handshake(hs => {
            if (hs.successful) {
                _client.subscribe(channelName, msg => {
                    assert.ok(msg.data);
                    _client.disconnect(() => {
                        done();
                    });
                }, ss => {
                    if (ss.successful) {
                        _server.getServerChannel(channelName).publish(null, 'data');
                    }
                });
            }
        });
    });

    it('publishes client-side message', done => {
        const channelName = '/gah';
        _client.handshake(hs => {
            if (hs.successful) {
                _client.subscribe(channelName, msg => {
                    assert.ok(msg.data);
                    _client.disconnect(() => {
                        done();
                    });
                }, ss => {
                    if (ss.successful) {
                        _client.publish(channelName, 'data');
                    }
                });
            }
        });
    });

    it('receives server-side publish via /meta/connect', done => {
        const channelName = '/hua';
        _client.handshake(hs => {
            if (hs.successful) {
                const session = _server.getServerSession(hs.clientId!);
                session.addListener('suspended', () => {
                    _server.getServerChannel(channelName).publish(null, 'data');
                });
                _client.subscribe(channelName, msg => {
                    assert.ok(msg.data);
                    _client.disconnect(() => {
                        done();
                    });
                });
            }
        });
    });

    it('invokes handshake policy', done => {
        _server.policy = {
            canHandshake: (session, message, callback) => {
                callback(undefined, !!((message as any).credentials));
            }
        };

        // Try without authentication fields.
        _client.handshake({}, hs1 => {
            assert.strictEqual(hs1.successful, false);
            assert.ok(hs1.advice);
            assert.strictEqual(hs1.advice.reconnect, 'none');

            // Try with authentication fields.
            setTimeout(() => {
                _client.handshake({
                    credentials: 'secret'
                }, hs2 => {
                    assert.strictEqual(hs2.successful, true);
                    _client.disconnect(() => {
                        done();
                    });
                });
            }, 0);
        });
    });

    it('provides access to HTTP context', done => {
        const channelName = '/service/kal';
        _server.createServerChannel(channelName).addListener('message', (session, channel, message, callback) => {
            assert.ok(_server.context.request);
            assert.ok(_server.context.response);
            session.deliver(null, channelName, message.data);
            callback();
        });

        _client.addListener(channelName, () => {
            done();
        });

        _client.handshake(hs => {
            if (hs.successful) {
                _client.publish(channelName, 'luz');
            }
        });
    });
});
