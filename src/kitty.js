(function (global) {

    var config = {};

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

    function getProp(object, prop) {
        if (!prop) { return prop; }
        var segment = prop.split('.');
        for (var i = 0; i < segment.length; i++) {
            object = object[segment[i]];
            if (!object) { return object; }
        }
        return object;
    }

    function isArray(obj) {
        return toString.call(obj) === '[object Array]';
    }
    function isString(obj) {
        return toString.call(obj) === '[object String]';
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
            if (isBuiltinModule(deps[i])) {
                this.remain--;
                continue;
            }

            if (deps[i].indexOf('!') > -1) {
                // plugin dependence
                loadPlugin(me, deps[i], callback);

            } else {
                var absId = resolveId(deps[i], this.id);
                var m = getModule(absId);
                if (m.state >= STATUS.LOADED || (m.state === STATUS.LOADING && !me.isForce)) {
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

        function onloadListener() {
            var readyState = script.readyState;
            if (
                typeof readyState === 'undefined'
                || /^(loaded|complete)$/.test(readyState)
            ) {

                me.state = STATUS.FETCHED;
                me.load();
                interactiveScript = null;
            }
        }

        var uri = this.uri;
        var script = document.createElement('script');

        if (script.readyState) {
            script.onreadystatechange = onloadListener;
        }
        else {
            script.onload = onloadListener;
        }

        script.src = uri + '.js';
        script.setAttribute('data-module-id', this.id);
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
        if (arguments.length === 1) {
            // define(factory)
            factory = id;
            id = '';
            deps = null;
        } else if (arguments.length === 2) {
            // defind(deps, factory)
            // defind(id, factory)
            factory = deps;
            if (isArray(id)) {
                deps = id;
                id = '';
            } else {
                deps = null;
            }
        }
        var isDepsDec = true;
        if (!isArray(deps) && typeof (factory) === 'function') {
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

    require = requireFactory(cid());

    function requireFactory(base) {
        return function (deps, callback, isForce) {
            if (!isArray(deps)) {
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
                        if (mod.deps[i].indexOf('!') === -1
                            && !isBuiltinModule(mod.deps[i])) {
                            var absId = resolveId(mod.deps[i], mod.id);
                            getModule(absId).exec();
                        }
                    }
                    this.exec();
                };
                mod.state = STATUS.FETCHED;
                mod.isForce = isForce;
                mod.load();
            }
        };
    }

    function parseId(id) {
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
        for (var i = 0; i < pathsList.length; i++) {
            var pathConf = pathsList[i];
            if (hasPrefix(id, pathConf.k)) {
                id = id.replace(pathConf.k, pathConf.v);
                break;
            }
        }

        if (id.charAt(0) === '/' || id.indexOf('http') === 0) {
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
            if (hasPrefix(base, map.k) || map.k === '*') {
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
            if (!object[key] || isString(object[key])) {
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
            for (var i = 0; i < m.deps.length; i++) {
                depsExport.push( m.require(m.deps[i]) );
            }
            var exports = depsExport;
            m.shim.exports && (exports = getProp(global, m.shim.exports));
            if (m.shim.init && (t = m.shim.init.apply(global, depsExport))) {
                exports = t;
            }
            m.exports = exports;
        };

        m.state = STATUS.UNFETCH;
        m.fetch = function () {
            var me = this;
            if (this.state >= STATUS.FETCHING) {return;}

            if (this.deps && this.deps.length !== 0) {
                this.require(this.deps, function(){
                    Module.prototype.fetch.call(me);
                });
            } {
                Module.prototype.fetch.call(me);
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

        for (var i = 0; i < config.packages.length; i++) {
            var packageConf = config.packages[i];
            if (isString(packageConf)) {
                var segment = packageConf.split('/');
                config.packages[i] = {
                    name: segment[0],
                    location: packageConf,
                    main: 'main'
                };
            }
            packageConf = config.packages[i];
            packageConf.main && (packageConf.main = packageConf.main.replace('.js',''));
            if (packageConf.location) {
                config.paths[packageConf.name] = packageConf.location;
            }
        }

        mapList = mapToSortedList(config.map);
        for (var i = 0; i < mapList.length; i++) {
            mapList[i].v = mapToSortedList(mapList[i].v);
        }

        pathsList = mapToSortedList(config.paths);

        var shims = config.shim;
        for (var key in shims) {
            var shim = shims[key];
            if (isArray(shim)) {
                shims[key] = shim = {
                    deps: shim
                };
            }
            var m = getModule(key);
            m.shim = shim;
            buildShimConf(m);
        }
    };

    global.define = define;
    global.require = require;

})(window);
