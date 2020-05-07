'use strict';

const assert = require('assert');
const http = require('http');
const serverLib = require('..');
const serverAck = require('../ack-extension');
require('cometd-nodejs-client').adapt();
const clientLib = require('cometd');
const ClientAck = require('cometd/AckExtension');
const Latch = require('./latch.js');

describe('acknowledgment extension', () => {
    let _server;
    let _http;
    let _client;
    let _uri;

    beforeEach(done => {
        _server = serverLib.createCometDServer();
        _server.addExtension(new serverAck.AcknowledgedMessagesExtension());
        _http = http.createServer(_server.handle);
        _http.listen(0, 'localhost', () => {
            let port = _http.address().port;
            console.log('listening on localhost:' + port);
            _uri = 'http://localhost:' + port + '/cometd';
            _client = new clientLib.CometD();
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

        _client.addListener('/meta/connect', m => {
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
            outgoing: message => {
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
        let messages = [];
        let messageLatch = new Latch(2, () => {
            assert.strictEqual(messages.length, 2);
            assert.strictEqual(messages[0], '1');
            assert.strictEqual(messages[1], '1');
            _client.disconnect(() => {
                done();
            });
        });
        _client.handshake(hs => {
            if (hs.successful) {
                _client.batch(() => {
                    _client.subscribe('/test', m => {
                        messages.push(m.data);
                        messageLatch.signal();
                    });
                });
            }
        });
    });
});
