var assert = require('assert');
var cometd = require('..');

describe('library', function() {
    it('exports factory method', function() {
        assert.ok(cometd.createCometDServer);
    });

    it('constructs object', function() {
        var server = cometd.createCometDServer();
        assert.ok(server);
        server.close();
    });

    it('constructs object with options', function() {
        var options = {};
        var server = cometd.createCometDServer(options);
        assert.notStrictEqual(server.options, options);
        server.close();
    });
});
