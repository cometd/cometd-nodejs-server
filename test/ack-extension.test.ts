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
const assert = require('assert');
import http = require('http');
import serverLib = require('..');
// @ts-ignore
import clientLib = require('cometd');

const serverAck = require('../ack-extension');
const ClientAck = require('cometd/AckExtension');
import {Latch} from './latch';
import {AddressInfo} from 'net';

require('cometd-nodejs-client').adapt();

describe('acknowledgment extension', () => {
    let _server: serverLib.CometDServer;
    let _http: http.Server;
    let _client: clientLib.CometD;
    let _uri: string;

    beforeEach(done => {
        _server = serverLib.createCometDServer();
        _server.addExtension(new serverAck.AcknowledgedMessagesExtension());
        _http = http.createServer(_server.handle);
        _http.listen(0, 'localhost', () => {
            const port = (_http.address() as AddressInfo).port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            _client = new clientLib.CometD();
            _client.unregisterTransport('websocket');
            _client.registerExtension('ack', new ClientAck());
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

    it('sets batch number', done => {
        let latch = new Latch(2, done);
        _server.getServerChannel('/meta/connect').addListener('message', (session, channel, message, callback) => {
            if (message.ext && typeof message.ext.ack === 'number') {
                latch.signal();
            }
            callback();
        });

        _client.addListener('/meta/connect', (m: any) => {
            if (m.ext && typeof m.ext.ack === 'number') {
                _client.disconnect();
                latch.signal();
            }
        });

        _client.handshake();
    });

    it('resends messages', done => {
        // Setup the client to fake the batch numbers.
        // Extension.outgoing is notified in reverse order.
        const ackExt = _client.getExtension('ack');
        _client.unregisterExtension('ack');
        let metaConnects = 0;
        _client.registerExtension('test', {
            outgoing: (message: any) => {
                if (message.channel === '/meta/connect') {
                    if (++metaConnects === 3) {
                        // Decrement the batch number to get the message again.
                        --message.ext.ack;
                    }
                }
            }
        });
        _client.registerExtension('ack', ackExt);

        // When the /meta/connect suspends the first time, publish a message.
        let suspends = 0;
        _server.addListener('sessionAdded', session => {
            session.addListener('suspended', () => {
                if (++suspends === 1) {
                    _client.publish('/test', '1');
                }
            });
        });

        // Store the received messages and verify them.
        let messages: any[] = [];
        let messageLatch = new Latch(2, () => {
            assert.strictEqual(messages.length, 2);
            assert.strictEqual(messages[0], '1');
            assert.strictEqual(messages[1], '1');
            _client.disconnect(() => {
                done();
            });
        });
        _client.handshake((hs: any) => {
            if (hs.successful) {
                _client.batch(() => {
                    _client.subscribe('/test', (m: any) => {
                        messages.push(m.data);
                        messageLatch.signal();
                    });
                });
            }
        });
    });
});
