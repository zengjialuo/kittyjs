

var config = {};

var cwd = dirName(location.pathname);
var config = {
    baseUrl: '.',
    paths: {},
    packages: [],
    map: {}
};
var mapList;
var toString = Object.prototype.toString;



var cachedMod = {};

var STATUS = {
    UNFETCH: 0,
    FETCHING: 1,
    FETCHED: 2,
    LOADING: 3,
    LOADED: 4,
    EXECUTED: 5
};


var _cid = 0;
function cid() {
    return './async-' + _cid++;
}

function dirName(uri) {
    uri = uri.split('/');
    if (uri[uri.length-1] === '') { uri.pop(); }
    uri.pop();
    return uri.join('/'); 
}

var interactiveScript;

function getCurrentScript() {
    if (document.currentScript) {
        return document.currentScript;
    }

    // For IE6-9 browsers, the script onload event may not fire right
    // after the script is evaluated. Kris Zyp found that it
    // could query the script nodes and the one that is in "interactive"
    // mode indicates the current script
    // ref: http://goo.gl/JHfFW
    var scripts = document.getElementsByTagName('script');

    for (var i = scripts.length - 1; i >= 0; i--) {
        var script = scripts[i];
        if (script.readyState === 'interactive') {
            interactiveScript = script;
            return interactiveScript;
        }
    }
}

function Module(id) {
    var mod = this;
    this.id = id;
    this.uri = id2uri(id);
    this.isDepsDec = true;
    this.deps = [];
    this.factory = function (){};
    this.exports = {};

    this.state = STATUS.UNFETCH;
    this.remain;
    this.comleteLoadListeners = [];

    this.require = requireFactory(this.id);

    this.require.toUrl = function (id) {
        var absId = resolveId(id, mod.id);
        return id2uri(absId);
    };

    this.normalize = function (name) {
        return resolveId(name, mod.id);
    };

    this.requireModule = function (id) {
        return cachedMod[ resolveId(id, mod.id) ];
    };

    this.config = function () {
        return mod._config;
    };

    this._config = (config.config && config.config[id]) || {};
}

Module.prototype.getDepsExport = function () {
    if (this.state < STATUS.LOADED) {
        throw new Error('getDepsExport before loaded');
    }

    var mod = this;
    var exports = [];

    if (!this.isDepsDec) {
        exports = [ mod.require, mod.exports, mod ];
    } else  {
        var deps = this.deps || [];
        var argsLen = this.factory.length < deps.length
            ? this.factory.length
            : deps.length;
        for (var i = 0; i < argsLen; i++) {
            switch (deps[i]) {
                case 'require':
                    exports.push(mod.require);
                    break;
                case 'exports':
                    exports.push(mod.exports);
                    break;
                case 'module':
                    exports.push(mod);
                    break;
                default:
                    exports.push(mod.require(deps[i]));
            }
        }
    }
    return exports;
};

Module.prototype.load = function(callback) {
    if (this.state >= STATUS.LOADING) {return;}
    if (this.state === STATUS.FETCHING) {return;}
    if (this.state <= STATUS.UNFETCH) {
        this.fetch();
        return;
    }
    this.state = STATUS.LOADING;

    var me = this;
    var deps = this.deps || [];

    me.remain = deps.length;

    function callback() {
        me.remain--;
        if (me.remain === 0) {
            me.onload();
        }
    }

    for (var i = 0; i < deps.length; i++) {
        if (['require', 'exports', 'module'].indexOf(deps[i]) > -1) {
            this.remain--;
            continue;
        }

        if (deps[i].indexOf('!') > -1) {
            // plugin dependence
            loadPlugin(me, deps[i], callback);

        } else {
            var absId = resolveId(deps[i], this.id);
            var m = getModule(absId);
            if (m.state >= STATUS.LOADED || (m.state === STATUS.LOADING && !me.force)) {
                //  equal situation is for circle dependency
                me.remain--;
                continue;
            }
            m.comleteLoadListeners.push(callback);
            if (m.state < STATUS.LOADED) {
                m.load();
            }
        }
    }
    if (this.remain === 0) {
        this.onload();
    }
};

Module.prototype.onload = function () {
    if (this.state >= STATUS.LOADED) { return ; }
    this.state = STATUS.LOADED;

    var listeners = this.comleteLoadListeners;
    for (var i = 0; i < listeners.length; i++) {
        listeners[i]();
    }

    this.callback && this.callback();
};

Module.prototype.exec = function () {
    if (this.state >= STATUS.EXECUTED) { return this.exports; }

    var args = this.getDepsExport();
    if (typeof this.factory === 'function') {
        var ret = this.factory.apply(null, args);
        this.exports = ret || this.exports;
    } else {
        this.exports = this.factory;
    }
    this.state = STATUS.EXECUTED;
    return this.exports;
};


Module.prototype.fetch = function () {
    var me = this;
    me.state = STATUS.FETCHING;

    var uri = this.uri;
    var script = document.createElement('script');
    script.onload = function () {
        me.state = STATUS.FETCHED;
        me.load();
    };
    script.src = uri + '.js';
    script['data-module-id'] = this.id;
    script.async = true;
    document.head.appendChild(script);
};

function loadPlugin(module, pluginAndResource, callback) {
    var parsedId = parseId(pluginAndResource);
    var pluginId = parsedId.pluginId;
    var resourceId = parsedId.resourceId;

    function onload(value) {
        var cacheId = normalizeResourceId(module, pluginAndResource);
        cachedMod[cacheId] = {
            exports: value
        };
        callback();
    }

    module.require([ pluginId ], function (plugin) {
        if (!plugin.normalize) {
            plugin.normalize = function (name, normalize) {
                return normalize(name);
            };
        }
        var cacheId = normalizeResourceId(module, pluginAndResource);
        if ( cachedMod[cacheId] ) {
            callback();
        } else {
            plugin.load(resourceId, module.require, onload, module.requireModule(pluginId).config());
        }
    }, 1);
}

function normalizeResourceId(module, pluginAndResource) {
    var parsedId = parseId(pluginAndResource);
    var pluginId = parsedId.pluginId;
    var resourceId = parsedId.resourceId;
    var pluginAbsId = resolveId(pluginId, module.id);
    var plugin = getModule(pluginAbsId).exec();

    return pluginAbsId + '!' + plugin.normalize(resourceId, module.normalize);
}

function define(id, deps, factory) {
    if (arguments.length === 1) {
        // define(factory)
        factory = id;
        id = '';
        deps = null;
    } else if (arguments.length === 2) {
        // defind(deps, factory)
        // defind(id, factory)
        factory = deps;
        if (Array.isArray(id)) {
            deps = id;
            id = '';
        } else {
            deps = null;
        }
    }
    var isDepsDec = true;
    if (!Array.isArray(deps) && typeof (factory) === 'function') {
        deps = [];
        factory.toString()
            .replace(/(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg, '')
            .replace(/[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g, function (match, dep) {
                deps.push(dep);
            });
        isDepsDec = false;
    }

    if (!id) {
        var script = getCurrentScript();
        script && console.log(script);
        id = script && script['data-module-id'];
    }

    if (!id) { return ; }
    var mod = getModule(id);

    
    mod.id = id;
    mod.deps = deps || [];
    mod.isDepsDec = isDepsDec;
    mod.factory = factory;
    mod.state = STATUS.FETCHED;

};

define.amd = {};

require = requireFactory(cid());

function requireFactory(base) {
    return function (deps, callback, force) {
        if (!Array.isArray(deps)) {
            // require( 'a' ) or require( 'a!./b' )
            var parsedId = parseId(deps);
            if (parsedId.resourceId) {
                var module = getModule(base);
                var cacheId = normalizeResourceId(module, deps);
                return cachedMod[cacheId].exports;
            } else {
                var id = resolveId(parsedId.pluginId, base);
                return getModule(id).exec();
            }

        } else {
            var randomId = resolveId(cid(), base);
            var mod = new Module(randomId);
            mod.deps = deps;
            mod.factory = callback || function(){};
            mod.callback = function() {
                for (var i = 0; i < mod.deps.length; i++) {
                    if (mod.deps[i].indexOf('!') === -1) {
                        var absId = resolveId(mod.deps[i], mod.id);
                        getModule(absId).exec();
                    }
                }
                this.exec();
            };
            mod.state = STATUS.FETCHED;
            mod.force = force;
            mod.load();
        }
    };
}

function parseId(id){
    var segment = id.split('!');
    return {
        pluginId: segment[0],
        resourceId: segment[1]
    };
}

function getModule(id) {
    return cachedMod[id] || (cachedMod[id] = new Module(id));
}


function relativeUri(uri, base) {
    var segment = base.split('/').concat(uri.split('/'));
    var path = [];
    for (var i = 0; i < segment.length; i++) {
        if (!segment[i] || segment[i] === '.') { continue; }
        if (segment[i] === '..') {
            path.pop();
        } else {
            path.push(segment[i]);
        }
    }

    return path.join('/');
}

function id2uri(id) {
    for (var key in config.paths) {
        if (hasPrefix(id, key)) {
            id = id.replace(key, config.paths[key]);
            break;
        }
    }

    if (id[0] === '/' || id.indexOf('http') === 0) {
        return id;
    } else {
        return '/' + relativeUri(id, (config.baseUrl || cwd));
    }
}

function hasPrefix(str, prefix) {
    return (str + '/').indexOf(prefix + '/') === 0;
}

function resolveId(id, base) {

    id = packagedId(id);
    id = mappedId(id, base);

    if (id.indexOf('.') === 0) {
        id = relativeUri(id, dirName(base));
    }
    // 
    id = packagedId(id);
    return id;
}

function mappedId(id, base) {
    for (var i = 0; i < mapList.length; i++) {
        var map = mapList[i];
        if (hasPrefix(base, map.k)) {
            var key = map.v;
            for (var j = 0; j < key.length; j++) {
                if (hasPrefix(id, key[j].k)) {
                    id = id.replace(key[j].k, key[j].v);
                    break;
                }
            }
            break;
        }
    }
    return id;
}

function packagedId(id) {
    for (var i = 0; i < config.packages.length; i++) {
        var packageConf = config.packages[i];
        if (id === packageConf.name) {
            id = packageConf.name + '/' + (packageConf.main || 'main');
        }
    }
    return id;
}

function extend(object, source) {
    for (var key in source) {
        if (!object[key] || toString.call(object[key]) === '[object String]') {
            object[key] = source[key];
        } else {
            extend(object[key], source[key]);
        }
    }
}

function mapToSortedList(object) {
    var list = [];

    for (var key in object) {
        if (object.hasOwnProperty(key)) {
            list.push({
                k: key,
                v: object[key]
            });
        }
    }
    list.sort(function (a, b) {
        return b.k.length - a.k.length;
    });
    return list;
}

require.config = function (object) {
    extend(config, object);

    if (object.baseUrl) {
        if (object.baseUrl[0] === '.') {
            config.baseUrl = relativeUri(object.baseUrl, cwd);
        } else {
            config.baseUrl = object.baseUrl;
        }
    }

    for (var i = 0; i < config.packages.length; i++) {
        var packageConf = config.packages[i];
        if (toString.call(packageConf) === '[object String]') {
            var segment = packageConf.split('/');
            config.packages[i] = {
                name: segment[0],
                location: packageConf,
                main: 'main'
            };
        }
        packageConf = config.packages[i];
        if (packageConf.location) {
            config.paths[packageConf.name] = packageConf.location;
        }
    }

    mapList = mapToSortedList(config.map);
    for (var i = 0; i < mapList.length; i++) {
        mapList[i].v = mapToSortedList(mapList[i].v);
    }
};

