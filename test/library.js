var assert = require('assert');
var cometd = require('..');

describe('library', function() {
    it('factory method exported', function() {
        assert.ok(cometd.createCometDServer);
    });

    it('constructs objects', function() {
        var server = cometd.createCometDServer();
        assert.ok(server);
        server.close();
    });

    it('constructor with options', function() {
        var options = {};
        var server = cometd.createCometDServer(options);
        assert.notStrictEqual(server.options, options);
        server.close();
    });
});
