

var path = require( 'path' );
exports.input = path.resolve( __dirname, 'src' );
exports.output = path.resolve( __dirname, 'dist' );

// var moduleEntries = 'html,htm,phtml,tpl,vm,js';
// var pageEntries = 'html,htm,phtml,tpl,vm';

exports.getProcessors = function () {
    var jsProcessor = new JsCompressor();

    return [jsProcessor];
};

exports.exclude = [
    'test'
];

exports.injectProcessor = function ( processors ) {
    for ( var key in processors ) {
        global[ key ] = processors[ key ];
    }
};

