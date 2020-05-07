'use strict';

module.exports = (() => ({
    AcknowledgedMessagesExtension: function() {
        function BatchQueue() {
            const _elements = [];
            const _batches = [];
            let _batch = 1;

            return {
                get size() {
                    return _elements.length;
                },
                get batch() {
                    return _batch;
                },
                set batch(value) {
                    _batch = value;
                },
                offer: element => {
                    _elements.push(element);
                    _batches.push(_batch);
                },
                clearToBatch: batch => {
                    let deleteCount = 0;
                    for (let i = 0; i < _elements.length; ++i) {
                        if (_batches[i] > batch) {
                            break;
                        }
                        ++deleteCount;
                    }
                    _elements.splice(0, deleteCount);
                    _batches.splice(0, deleteCount);
                },
                sliceToBatch(batch) {
                    const result = [];
                    for (let i = 0; i < _elements.length; ++i) {
                        if (_batches[i] > batch) {
                            break;
                        }
                        result.push(_elements[i]);
                    }
                    return result;
                }
            };
        }

        function SessionExtension(cometd, session) {
            const _batches = {};
            const _queue = new BatchQueue();

            function _queueOffer(session, message) {
                _queue.offer(message);
                cometd._log('cometd.session.ext.ack', 'stored at batch', _queue.batch, 'session', session.id, message);
            }

            function _queueDrain(session, messageQueue, replies) {
                let metaConnectId;
                for (let i = 0; i < replies.length; ++i) {
                    const reply = replies[i];
                    if (reply.channel === '/meta/connect') {
                        metaConnectId = reply.id;
                        break;
                    }
                }
                if (metaConnectId) {
                    const batch = _batches[metaConnectId];
                    delete _batches[metaConnectId];
                    const messageBatch = _queue.sliceToBatch(batch);
                    cometd._log('cometd.session.ext.ack', 'replacing', messageQueue.length, 'messages with', messageBatch.length, 'unacked messages from batch', batch, 'session', session.id);
                    // Clear the queue and add the batch of message to send.
                    messageQueue.splice(0, messageQueue.length);
                    messageQueue.push.apply(messageQueue, messageBatch);
                }
            }

            session._metaConnectDeliveryOnly = true;
            session.addListener('queueOffer', _queueOffer);
            session.addListener('queueDrain', _queueDrain);

            return {
                incoming: (session, message, callback) => {
                    if (message.channel === '/meta/connect') {
                        const ext = message.ext;
                        if (ext) {
                            const ack = ext.ack;
                            if (typeof ack === 'number') {
                                // Clear the queue up to the acknowledged batch.
                                _queue.clearToBatch(ack);
                                cometd._log('cometd.session.ext.ack', 'processing batch: client:', ack, 'server:', _queue.batch, 'session', session.id);
                                if (!session._hasMessages && _queue.size > 0) {
                                    const advice = message.advice || {};
                                    message.advice = advice;
                                    advice.timeout = 0;
                                    cometd._log('cometd.session.ext.ack', 'forcing advice:{timeout:0} session', session.id);
                                }
                            }
                        }
                    }
                    callback();
                },
                outgoing: (sender, session, message, callback) => {
                    if (message.channel === '/meta/handshake') {
                        const hsExt = message.ext || {};
                        message.ext = hsExt;
                        hsExt.ack = true;
                    } else if (message.channel === '/meta/connect') {
                        // Close the batch.
                        const batch = _queue.batch++;
                        _batches[message.id] = batch;
                        const cnExt = message.ext || {};
                        message.ext = cnExt;
                        cnExt.ack = batch;
                    }
                    callback();
                }
            };
        }

        return {
            incoming: (cometd, session, message, callback) => {
                if (message.channel === '/meta/handshake') {
                    const clientExt = message.ext;
                    const clientAck = clientExt && clientExt.ack === true;
                    if (clientAck) {
                        cometd._log('cometd.server.ext.ack', 'enabled acknowledged messages extension for session', session.id);
                        session.addExtension(new SessionExtension(cometd, session));
                    }
                }
                callback();
            }
        };
    }
}))();
