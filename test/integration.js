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
const Latch = require('./latch.js');
const cometd = require('..');
require('cometd-nodejs-client').adapt();
const clientLib = require('cometd');

describe('integration', () => {
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

    it('sweeps channels', function(done) {
        const period = 500;
        _cometd.options.sweepPeriod = period;
        this.timeout(5 * period);

        const channelName = '/jaz';

        _cometd.addListener('channelRemoved', channel => {
            assert.strictEqual(channel.name, channelName);
            done();
        });

        _client.handshake(hs => {
            if (hs.successful) {
                let channel = _cometd.createServerChannel(channelName);
                const listener = () => undefined;
                // Add a listener to make the channel non sweepable.
                channel.addListener('message', listener);
                // Wait for a few sweeps.
                setTimeout(() => {
                    channel = _cometd.getServerChannel(channelName);
                    assert.ok(channel);
                    // Remove the listener to make the channel sweepable.
                    channel.removeListener('message', listener);
                }, 2 * period);
            }
        });
    });

    it('handles multiple sessions', done => {
        const client1 = new clientLib.CometD();
        client1.configure({
            url: _uri
        });

        const client2 = new clientLib.CometD();
        client2.configure({
            url: _uri
        });

        client2.addListener('/meta/connect', message => {
            const advice = message.advice;
            if (advice && advice['multiple-clients']) {
                client1.disconnect(() => {
                    client2.disconnect(() => {
                        done();
                    });
                });
            }
        });

        // The second client must handshake after the first client to avoid
        // that the server generates two different BAYEUX_BROWSER cookies.
        client1.handshake(hs1 => {
            if (hs1.successful) {
                const session = _cometd.getServerSession(hs1.clientId);
                session.addListener('suspended', () => {
                    client2.handshake();
                });
            }
        });
    });

    it('handles server-side disconnects', done => {
        const client = new clientLib.CometD();
        client.configure({
            url: _uri
        });

        const latch = new Latch(2, done);
        client.handshake(hs => {
            if (hs.successful) {
                client.addListener('/meta/disconnect', () => {
                    latch.signal();
                });

                const session = _cometd.getServerSession(client.getClientId());
                session.addListener('suspended', () => {
                    client.addListener('/meta/connect', () => {
                        latch.signal();
                    });

                    setTimeout(() => {
                        session.disconnect();
                    }, 0);
                });
            }
        });
    });
});
