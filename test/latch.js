'use strict';

module.exports = function(count, callback) {
    this.signal = () => {
        if (--count === 0) {
            callback();
        }
    };
};
