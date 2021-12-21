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
import * as http from 'http';
import * as serverLib from '..';
import * as clientLib from 'cometd';
import {AddressInfo} from 'net';

require('cometd-nodejs-client').adapt();

describe('chat', () => {
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

    const _broadcastChannel = '/chat';
    const _serviceChannel = '/service/chat';

    it('chats', function(done) {
        const delay = 1000;
        _server.options.multiSessionInterval = delay;
        this.timeout(2 * delay);

        const client1 = new clientLib.CometD();
        client1.configure({
            url: _uri
        });

        const client2 = new clientLib.CometD();
        client2.configure({
            url: _uri
        });

        // The second client must handshake after the first client to avoid
        // that the server generates two different BAYEUX_BROWSER cookies.
        // The second client will be in 'multiple-clients' mode.
        client1.handshake(hs1 => {
            if (hs1.successful) {
                client2.handshake(hs2 => {
                    if (hs2.successful) {
                        client1.subscribe(_broadcastChannel, msg1 => {
                            if (msg1.data.user !== 1) {
                                client1.disconnect(() => {
                                    client2.disconnect(() => {
                                        done();
                                    });
                                });
                            }
                        }, ss1 => {
                            if (ss1.successful) {
                                client2.subscribe(_broadcastChannel, msg2 => {
                                    if (msg2.data.user !== 2) {
                                        client2.publish(_serviceChannel, {
                                            user: 2,
                                            text: 'Hi ' + msg2.data.user + '! I am 2.'
                                        });
                                    }
                                }, ss2 => {
                                    if (ss2.successful) {
                                        client1.publish(_serviceChannel, {
                                            user: 1,
                                            text: 'Hello!'
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

        // The service receives a service message and broadcasts it to subscribers.
        // This allows the service to analyze the message and perform business logic.
        _server.createServerChannel(_serviceChannel).addListener('message', (session, channel, message, callback) => {
            _server.getServerChannel(_broadcastChannel).publish(session, message.data, callback);
        });
    });
});
