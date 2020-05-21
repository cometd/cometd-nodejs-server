/*
 * Copyright (c) 2017-2020 the original author or authors.
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
'use strict';

const http = require('http');
const assert = require('assert');
const cometd = require('..');
require('cometd-nodejs-client').adapt();
const clientLib = require('cometd');

describe('usage', () => {
    let _cometd;
    let _server;
    let _client;
    let _uri;

    beforeEach(done => {
        _cometd = cometd.createCometDServer();
        _server = http.createServer(_cometd.handle);
        _server.listen(0, 'localhost', () => {
            const port = _server.address().port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            _client = new clientLib.CometD();
            _client.configure({
                url: _uri
            });
            done();
        });
    });

    afterEach(() => {
        _server.close();
        _cometd.close();
    });

    it('notifies /meta/handshake listener', done => {
        const metaHandshake = _cometd.getServerChannel('/meta/handshake');
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
        const broadcast = _cometd.createServerChannel(channelName);
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
                        const channel = _cometd.getServerChannel(channelName);
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
                const session = _cometd.getServerSession(reply.clientId);
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
                        _cometd.getServerChannel(channelName).publish(null, 'data');
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
                    assert.strictEqual(msg.reply, undefined);
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
                const session = _cometd.getServerSession(hs.clientId);
                session.addListener('suspended', () => {
                    _cometd.getServerChannel(channelName).publish(null, 'data');
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
        _cometd.policy = {
            canHandshake: (session, message, callback) => {
                callback(undefined, !!message.credentials);
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
        _cometd.createServerChannel(channelName).addListener('message', (session, channel, message, callback) => {
            assert.ok(_cometd.context.request);
            assert.ok(_cometd.context.response);
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

    it('inheritance', done => {
        function Base() {
            const _private = 1;

            function _internal() {
                return this.getConstant();
            }

            // "abstract" function.
            // Can be overridden in "subclasses", and invoked
            // from "superclass" via "this" (as long as subclasses
            // pass the right "this" using call()).
            this.getConstant = () => {
                throw 'abstract';
            };

            this.getBaseValue = function() {
                // return _private + this.getConstant();
                return _private + _internal.call(this);
            };

            return this;
        }

        Base.extends = parentObject => {
            // We need a fake function to
            // access the "prototype" property.
            function F() {
            }

            // Establish the inheritance chain.
            F.prototype = parentObject;
            const f = new F();
            // f -- inherits from --> F.prototype -- inherits from --> Object.prototype.
            // Now I can add functions to f.
            return f;
        };

        function Derived() {
            const _private = 5;
            const _super = new Base();
            const _self = Base.extends(_super);

            // Overriding "abstract" function.
            _self.getConstant = () => 10;

            // Overriding "concrete" function and calling super.
            _self.getBaseValue = function() {
                // Must use call() to pass "this" to super
                // in case superclass calls "abstract" functions.
                return _super.getBaseValue.call(this) + 2;
            };

            _self.getDerivedValue = function() {
                return this.getBaseValue() + _private;
            };

            return _self;
        }

        const d = new Derived();

        // 1 + 10 + 2
        assert.strictEqual(d.getBaseValue(), 13);
        // 13 + 5
        assert.strictEqual(d.getDerivedValue(), 18);

        done();
    });

});
