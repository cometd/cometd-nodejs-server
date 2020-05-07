'use strict';

const assert = require('assert');
const cometd = require('..');

describe('library', () => {
    it('exports factory method', () => {
        assert.ok(cometd.createCometDServer);
    });

    it('constructs object', () => {
        const server = cometd.createCometDServer();
        assert.ok(server);
        server.close();
    });

    it('constructs object with options', () => {
        const options = {};
        const server = cometd.createCometDServer(options);
        assert.notStrictEqual(server.options, options);
        server.close();
    });
});
