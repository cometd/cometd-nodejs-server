module.exports = function() {
    return {
        AcknowledgedMessagesExtension: function() {
            var BatchQueue = function() {
                var _elements = [];
                var _batches = [];
                var _batch = 1;

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
                    offer: function(element) {
                        _elements.push(element);
                        _batches.push(_batch);
                    },
                    clearToBatch: function(batch) {
                        var deleteCount = 0;
                        for (var i = 0; i < _elements.length; ++i) {
                            if (_batches[i] > batch) {
                                break;
                            }
                            ++deleteCount;
                        }
                        _elements.splice(0, deleteCount);
                        _batches.splice(0, deleteCount);
                    },
                    sliceToBatch(batch) {
                        var result = [];
                        for (var i = 0; i < _elements.length; ++i) {
                            if (_batches[i] > batch) {
                                break;
                            }
                            result.push(_elements[i]);
                        }
                        return result;
                    }
                };
            };

            var SessionExtension = function(cometd, session) {
                var _batches = {};
                var _queue = new BatchQueue();

                function _queueOffer(session, message) {
                    _queue.offer(message);
                    cometd._log('cometd.session.ext.ack', 'stored at batch', _queue.batch, 'session', session.id, message);
                }

                function _queueDrain(session, messageQueue, replies) {
                    var metaConnectId;
                    for (var i = 0; i < replies.length; ++i) {
                        var reply = replies[i];
                        if (reply.channel === '/meta/connect') {
                            metaConnectId = reply.id;
                            break;
                        }
                    }
                    if (metaConnectId) {
                        var batch = _batches[metaConnectId];
                        delete _batches[metaConnectId];
                        var messageBatch = _queue.sliceToBatch(batch);
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
                    incoming: function(session, message, callback) {
                        if (message.channel === '/meta/connect') {
                            var ext = message.ext;
                            if (ext) {
                                var ack = ext.ack;
                                if (typeof ack === 'number') {
                                    // Clear the queue up to the acknowledged batch.
                                    _queue.clearToBatch(ack);
                                    cometd._log('cometd.session.ext.ack', 'processing batch: client:', ack, 'server:', _queue.batch, 'session', session.id);
                                    if (!session._hasMessages && _queue.size > 0) {
                                        var advice = message.advice || {};
                                        message.advice = advice;
                                        advice.timeout = 0;
                                        cometd._log('cometd.session.ext.ack', 'forcing advice:{timeout:0} session', session.id);
                                    }
                                }
                            }
                        }
                        callback();
                    },
                    outgoing: function(sender, session, message, callback) {
                        if (message.channel === '/meta/handshake') {
                            var hsExt = message.ext || {};
                            message.ext = hsExt;
                            hsExt.ack = true;
                        } else if (message.channel === '/meta/connect') {
                            // Close the batch.
                            var batch = _queue.batch++;
                            _batches[message.id] = batch;
                            var cnExt = message.ext || {};
                            message.ext = cnExt;
                            cnExt.ack = batch;
                        }
                        callback();
                    }
                };
            };

            return {
                incoming: function(cometd, session, message, callback) {
                    if (message.channel === '/meta/handshake') {
                        var clientExt = message.ext;
                        var clientAck = clientExt && clientExt.ack === true;
                        if (clientAck) {
                            cometd._log('cometd.server.ext.ack', 'enabled acknowledged messages extension for session', session.id);
                            session.addExtension(new SessionExtension(cometd, session));
                        }
                    }
                    callback();
                }
            };
        }
    };
}();
