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
import assert = require('assert');
import http = require('http');
import serverLib = require('..');
// @ts-ignore
import clientLib = require('cometd');
import {Latch} from './latch';
import {AddressInfo} from 'net';

require('cometd-nodejs-client').adapt();

describe('integration', () => {
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

    it('sweeps channels', function(done) {
        const period = 500;
        _server.options.sweepPeriod = period;
        this.timeout(5 * period);

        const channelName = '/jaz';

        _server.addListener('channelRemoved', channel => {
            assert.strictEqual(channel.name, channelName);
            done();
        });

        _client.handshake((hs: any) => {
            if (hs.successful) {
                let channel = _server.createServerChannel(channelName);
                const listener = () => undefined;
                // Add a listener to make the channel non sweepable.
                channel.addListener('message', listener);
                // Wait for a few sweeps.
                setTimeout(() => {
                    channel = _server.getServerChannel(channelName);
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

        client2.addListener('/meta/connect', (message: any) => {
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
        client1.handshake((hs1: any) => {
            if (hs1.successful) {
                const session = _server.getServerSession(hs1.clientId);
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
        client.handshake((hs: any) => {
            if (hs.successful) {
                client.addListener('/meta/disconnect', () => {
                    latch.signal();
                });

                const session = _server.getServerSession(client.getClientId());
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
