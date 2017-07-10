module.exports = function(count, callback) {
    this.signal = function() {
        if (--count === 0) {
            callback();
        }
    };
};
