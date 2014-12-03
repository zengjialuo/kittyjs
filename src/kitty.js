/**
 * @file kitty.js
 * @author zengjialuo(zengjialuo@gmail.com)
 */

(function (global, document) {

    var cwd = dirName(location.pathname);

    var config = {
        baseUrl: cwd,
        paths: {},
        packages: [],
        map: {},
        shim: {}
    };
    var mapList = [];
    var pathsList = [];

    var cachedMod = {};

    var STATUS = {
        UNFETCH: 0,
        FETCHING: 1,
        FETCHED: 2,
        LOADING: 3,
        LOADED: 4,
        EXECUTED: 5
    };

    var blank = function () {};
    var _cid = 0;
    function cid() {
        return './async-' + _cid++;
    }

    function getGlobalVar(prop) {
        var object = global;
        var segment = prop.split('.');
        each(segment, function (part) {
            object = object[part];
            if (!object) { return false; }
        });
        return object;
    }

    var toString = Object.prototype.toString;
    function isType(obj, type) {
        return toString.call(obj) === '[object ' + type + ']';
    }

    function each(source, iterator) {
        if (isType(source, 'Array')) {
            for (var i = 0, len = source.length; i < len; i++) {
                if (iterator(source[i], i) === false) {
                    break;
                }
            }
        }
    }

    function isBuiltinModule(id) {
        var builtinMOdule = {
            'require': 1,
            'exports': 1,
            'module': 1
        };
        return !!builtinMOdule[id];
    }

    var interactiveScript;
    var currentlyAddingScript;

    function getCurrentScript() {
        if (document.currentScript) {
            return document.currentScript;
        }

        if (currentlyAddingScript) {
            return currentlyAddingScript;
        }

        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }
        // For IE6-9 browsers, the script onload event may not fire right
        // after the script is evaluated. Kris Zyp found that it
        // could query the script nodes and the one that is in "interactive"
        // mode indicates the current script
        // ref: http://goo.gl/JHfFW
        var scripts = document.getElementsByTagName('script');

        each(scripts, function (script) {
            if (script.readyState === 'interactive') {
                interactiveScript = script;
                return false;
            }
        });
        return interactiveScript;
    }

    function Module(id) {
        var mod = this;
        mod.id = id;
        mod.uri = id2uri(id);
        mod.isDepsDec = true;
        mod.deps = [];
        mod.factory = blank;
        mod.exports = {};

        mod.state = STATUS.UNFETCH;
        mod.listeners = [];

        mod.require = requireFactory(mod.id);

        mod.require.toUrl = function (id) {
            var absId = resolveId(id, mod.id);
            return id2uri(absId);
        };

        mod.normalize = function (name) {
            return resolveId(name, mod.id);
        };

        mod.requireModule = function (id) {
            return cachedMod[ resolveId(id, mod.id) ];
        };

        mod.config = function () {
            return mod._config;
        };

        mod._config = (config.config && config.config[id]) || {};
    }

    Module.prototype.getDepsExport = function () {
        var mod = this;
        if (mod.state < STATUS.LOADED) {
            throw new Error('getDepsExport before loaded');
        }

        var exports = [];

        if (!mod.isDepsDec) {
            exports = [ mod.require, mod.exports, mod ];
        } else  {
            var deps = mod.deps || [];
            var argsLen = mod.factory.length < deps.length
                ? mod.factory.length
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
        var mod = this;

        if (mod.state === STATUS.FETCHING) { return;}
        if (mod.state <= STATUS.UNFETCH) {
            mod.fetch();
            return;
        }
        mod.state = STATUS.LOADING;

        var deps = mod.deps || [];

        mod.remain = deps.length;

        function callback() {
            mod.remain--;
            if (mod.remain === 0) {
                mod.onload();
            }
        }

        each(deps, function (dep) {
            if (isBuiltinModule(dep)) {
                mod.remain--;
                return;
            }

            if (dep.indexOf('!') > -1) {
                // plugin dependence
                loadPlugin(mod, dep, callback);

            } else {
                var absId = resolveId(dep, mod.id);
                var m = getModule(absId);
                if (m.state >= STATUS.LOADED || (m.state === STATUS.LOADING && !mod.isForce)) {
                    //  equal situation is for circle dependency
                    mod.remain--;
                    return;
                }
                m.listeners.push(callback);
                if (m.state < STATUS.LOADING) {
                    m.load();
                }
            }
        });

        if (mod.remain === 0) {
            mod.onload();
        }
    };

    Module.prototype.onload = function () {
        var mod = this;
        if (mod.state >= STATUS.LOADED) { return ; }
        mod.state = STATUS.LOADED;

        var listeners = mod.listeners;
        each(listeners, function (listener) {
            listener();
        });

        mod.callback && mod.callback();
    };

    Module.prototype.exec = function () {
        var mod = this;
        if (mod.state >= STATUS.EXECUTED) { return mod.exports; }

        var args = mod.getDepsExport();
        if (isType(mod.factory, 'Function')) {
            var ret = mod.factory.apply(null, args);
            mod.exports = ret || mod.exports;
        } else {
            mod.exports = mod.factory;
        }
        mod.state = STATUS.EXECUTED;
        return mod.exports;
    };



    Module.prototype.fetch = function () {
        var mod = this;
        mod.state = STATUS.FETCHING;

        function onloadListener() {
            var readyState = script.readyState;
            if (
                typeof readyState === 'undefined'
                || /^(loaded|complete)$/.test(readyState)
            ) {

                mod.state = STATUS.FETCHED;
                mod.load();
                interactiveScript = null;
            }
        }

        var uri = mod.uri;
        var script = document.createElement('script');

        if (script.readyState) {
            script.onreadystatechange = onloadListener;
        }
        else {
            script.onload = onloadListener;
        }

        script.src = uri + '.js';
        script.setAttribute('data-module-id', mod.id);
        script.async = true;
        appendScript(script);
    };


    var headElement = document.getElementsByTagName('head')[0];
    var baseElement = document.getElementsByTagName('base')[0];

    if (baseElement) {
        headElement = baseElement.parentNode;
    }

    function appendScript(script) {
        currentlyAddingScript = script;

        // If BASE tag is in play, using appendChild is a problem for IE6.
        // See: http://dev.jquery.com/ticket/2709
        baseElement
            ? headElement.insertBefore(script, baseElement)
            : headElement.appendChild(script);

        currentlyAddingScript = null;
    }

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
        if (factory == null) {
            // define(factory);
            if (deps == null) {
                factory = id;
                id = null;
            } else {
                // define(id, factory)
                // define(deps, factory)
                factory = deps;
                deps = null;
                if (isType(id, 'Array')) {
                    deps = id;
                    id = null;
                }
            }
        }

        var isDepsDec = true;
        if (!isType(deps, 'Array') && isType(factory, 'Function')) {
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
            id = script && script.getAttribute('data-module-id');
        }

        if (!id) { return ; }
        var mod = getModule(id);
        
        mod.id = id;
        mod.deps = deps || [];
        mod.isDepsDec = isDepsDec;
        mod.factory = factory;
        mod.state = STATUS.FETCHED;

    }

    define.amd = {};

    var require = requireFactory(cid());

    function requireFactory(base) {
        return function (deps, callback, isForce) {
            if (!isType(deps, 'Array')) {
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
                mod.factory = callback || blank;
                mod.callback = function() {
                    each(mod.deps, function (dep) {
                        if (dep.indexOf('!') === -1
                            && !isBuiltinModule(dep)) {
                            mod.require(dep);
                        }
                    });
                    mod.exec();
                };
                mod.state = STATUS.FETCHED;
                mod.isForce = isForce;
                mod.load();
            }
        };
    }

    function getModule(id) {
        return cachedMod[id] || (cachedMod[id] = new Module(id));
    }

    function relativeUri(uri, base) {
        var segment = base.split('/').concat(uri.split('/'));
        var path = [];

        each(segment, function (part) {
            if (!part || part === '.') { return; }
            if (part === '..') {
                path.pop();
            } else {
                path.push(part);
            }
        });

        return path.join('/');
    }

    function id2uri(id) {
        each(pathsList, function (pathConf) {
            if (hasPrefix(id, pathConf.k)) {
                id = id.replace(pathConf.k, pathConf.v);
                return;
            }
        });

        if (id.charAt(0) === '/' || id.indexOf('http') === 0) {
            return id;
        } else {
            return '/' + relativeUri(id, (config.baseUrl || cwd));
        }
    }

    function hasPrefix(str, prefix) {
        return (str + '/').indexOf(prefix + '/') === 0;
    }

    function dirName(uri) {
        var dir = uri.match(/([^?#]*)(\/[^$])/);
        return (dir && dir[1]) || '';
    }

    function resolveId(id, base) {

        id = packagedId(id);
        id = mappedId(id, base);

        if (id.indexOf('.') === 0) {
            id = relativeUri(id, dirName(base));
        }
        
        id = packagedId(id);
        return id;
    }

    function parseId(id) {
        var segment = id.split('!');
        return {
            pluginId: segment[0],
            resourceId: segment[1]
        };
    }

    function mappedId(id, base) {
        each(mapList, function (map) {
            if (hasPrefix(base, map.k) || map.k === '*') {
                each(map.v, function (key) {
                    if (hasPrefix(id, key.k)) {
                        id = id.replace(key.k, key.v);
                        return false;
                    }
                });

                return false;
            }
        });

        return id;
    }

    function packagedId(id) {
        each(config.packages, function (packageConf) {
            if (id === packageConf.name) {
                id = packageConf.name + '/' + (packageConf.main || 'main');
                return false;
            }
        });

        return id;
    }

    function extend(object, source) {
        for (var key in source) {
            if (!object[key] || isType(object[key], 'String')) {
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
            if (b.k === '*') { return -1; }
            if (a.k === '*') { return 1; }
            return b.k.length - a.k.length;
        });
        return list;
    }

    function buildShimConf(m) {
        var shim = m.shim;
        m.deps = shim.deps || [];
        m.factory = function() {
            var t;
            var depsExport = [];

            each(m.deps, function (dep) {
                depsExport.push( m.require(dep) );
            });

            var exports = depsExport;
            m.shim.exports && (exports = getGlobalVar(m.shim.exports));
            if (m.shim.init && (t = m.shim.init.apply(global, depsExport))) {
                exports = t;
            }
            m.exports = exports;
        };

        m.state = STATUS.UNFETCH;
        m.fetch = function () {
            if (m.state >= STATUS.FETCHING) {return;}

            if (m.deps && m.deps.length !== 0) {
                m.require(m.deps, function(){
                    Module.prototype.fetch.call(m);
                });
            } {
                Module.prototype.fetch.call(m);
            }
        };
    }

    require.config = function (object) {
        extend(config, object);

        if (object.baseUrl) {
            if (object.baseUrl.charAt(0) === '.') {
                config.baseUrl = relativeUri(object.baseUrl, cwd);
            } else {
                config.baseUrl = object.baseUrl;
            }
        }

        each(config.packages, function (packageConf, i) {
            if (isType(packageConf, 'String')) {
                var segment = packageConf.split('/');
                config.packages[i] = {
                    name: segment[0],
                    location: packageConf,
                    main: 'main'
                };
            }

            packageConf.main && (packageConf.main = packageConf.main.replace('.js',''));
            if (packageConf.location) {
                config.paths[packageConf.name] = packageConf.location;
            }
        });

        mapList = mapToSortedList(config.map);
        each(mapList, function (map) {
            map.v = mapToSortedList(map.v);
        });

        pathsList = mapToSortedList(config.paths);

        var shims = config.shim;
        for (var key in shims) {
            var shim = shims[key];
            if (isType(shim, 'Array')) {
                shims[key] = shim = {
                    deps: shim
                };
            }
            var m = getModule(key);
            m.shim = shim;
            buildShimConf(m);
        }
    };

    if (!global.define) {
        global.define = define;
        global.require = require;
    }

})(window, document);
