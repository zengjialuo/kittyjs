/*
* seed v1.1.4
* AMD module loader
*
* Copyright (c) 2013-2014 Yiguo Chan
* Released under the MIT Licenses
*
* Gighub : https://github.com/chenmnkken/seed.git
* Mail : chenmnkken@gmail.com
* Date : 2014-09-21
*/
(function( window, undefined ){

'use strict';

var seed = function(){
    var rProtocol = /^(file\:.+\:\/|[\w\-]+\:\/\/)/,
        rModId = /([^\/?]+?)(\.(?:js|css))?(\?.*)?$/, 
        rReadyState = /loaded|complete|undefined/,  
        
        moduleCache = {},    // 模块加载时的队列数据存储对象
        modifyCache = {},    // modify的临时数据存储对象
        
        head = document.head || 
        document.getElementsByTagName( 'head' )[0] || 
        document.documentElement,
        
        modClassName = 'seed_mod_' + ( +new Date() ) + ( Math.random() + '' ).slice( -8 ),
        isScriptOnload = !!document.addEventListener,
        
        // 模块加载器的配置对象
        moduleOptions = {
            baseUrl : null,
            charset : {},    // 模块对应的charset存储对象
            alias : {}
        };
        
    var easyModule = { 
        
        error : function( msg ){
            throw new Error( msg );
        },
        
        // 用于合并模块加载器配置的工具函数
        merge : function( key, options ){    
            if( options ){
                var name;
                
                for( name in options ){
                    moduleOptions[ key ][ name ] = options[ name ];
                }
            }
        },
        
        // 初始化模块加载器时获取baseUrl(既是当前js文件加载的url)
        init : function(){
            var i = 0,
                script, scripts, initMod, initBaseUrl, url;
            
            // firefox支持currentScript属性
            if( document.currentScript ){
                script = document.currentScript;
            }
            else{
                // 正常情况下，在页面加载时，当前js文件的script标签始终是最后一个
                scripts = document.getElementsByTagName( 'script' );            
                script = scripts[ scripts.length - 1 ];
            }           
            
            initMod = script.getAttribute( 'data-main' );
            initBaseUrl = script.getAttribute( 'data-baseurl' );            
            url = script.hasAttribute ? script.src : script.getAttribute( 'src', 4 );      
            
            // 如果seed是通过script标签inline添加到页面中其baseUrl就是当前页面的路径
            url = url || window.location.href;

            moduleOptions.baseUrl = initBaseUrl ? 
                easyModule.mergePath( initBaseUrl, window.location.href ) : 
                url.slice( 0, url.lastIndexOf('/') + 1 );
            
            // 初始化时加载data-main中的模块
            if( initMod ){
                initMod = initMod.split( ',' );
                seedExports.use( initMod );
            }

            scripts = script = null;
        },
        
        // 获取当前运行脚本的文件的名称
        // 用于获取匿名模块的模块名
        getCurrentScript : function(){
            var script, scripts, i, stack;
                
            // 标准浏览器(IE10、Chrome、Opera、Safari、Firefox)通过强制捕获错误(e.stack)来确定为当前运行的脚本
            // http://www.cnblogs.com/rubylouvre/archive/2013/01/23/2872618.html        
            try{
                // 运行一个不存在的方法强制制造错误
                easyModule.makeerror();
            }
            // 捕获错误
            // safari的错误对象只有line,sourceId,sourceURL
            catch( e ){ 
                stack = e.stack;
            }
            
            if( stack ){        
                // 取得最后一行,最后一个空格或@之后的部分
                stack = stack.split( /[@ ]/g ).pop();
                // 去掉换行符
                stack = stack[0] === '(' ? stack.slice( 1, -1 ) : stack.replace( /\s/, '' );
                //去掉行号与或许存在的出错字符起始位置
                return stack.replace( /(:\d+)?:\d+$/i, '' ).match( rModId )[1];             
            }
            
            // IE6-8通过遍历script标签，判断其readyState为interactive来确定为当前运行的脚本
            scripts = head.getElementsByTagName( 'script' );
            i = scripts.length - 1;
            
            for( ; i >= 0; i-- ){
                script = scripts[i];
                if( script.className === modClassName && script.readyState === 'interactive' ){
                    break;
                }
            }        
            
            return script.src.match( rModId )[1];
        },    
        
        // 将模块标识(相对路径)和基础路径合并成新的真正的模块路径(不含模块的文件名)
        mergePath : function( id, url ){
            var isRootDir = id.charAt(0) === '/',
                isHttp = url.slice( 0, 4 ) === 'http',
                domain = '',
                i = 0,
                protocol, isHttp, urlDir, idDir, dirPath, len, dir;

            protocol = url.match( rProtocol )[1];
            url = url.slice( protocol.length );
            
            // HTTP协议的路径含有域名
            if( isHttp ){
                domain = url.slice( 0, url.indexOf('/') + 1 );
                url = isRootDir ? '' : url.slice( domain.length );
            }
            
            // 组装基础路径的目录数组
            urlDir = url.split( '/' );
            urlDir.pop();
            
            // 组装模块标识的目录数组
            idDir = id.split( '/' );
            idDir.pop();                

            if( isRootDir ){
                idDir.shift();
            }      

            len = idDir.length;            
            
            for( ; i < len; i++ ){
                dir = idDir[i];
                // 模块标识的目录数组中含有../则基础路径的目录数组删除最后一个目录
                // 否则直接将模块标识的目录数组的元素添加到基础路径的目录数组中        
                if( dir === '..' ){
                    urlDir.pop();
                }
                else if( dir !== '.' ){
                    urlDir.push( dir );
                }
            }

            // 基础路径的目录数组转换成目录字符串
            dirPath = urlDir.join( '/' );    
            // 无目录的情况不用加斜杠
            dirPath = dirPath === '' ? '' : dirPath + '/';        
            return protocol + domain + dirPath;
        },
        
        /*
         * 解析模块标识，返回模块名和模块路径
         * @parmm { String } 模块标识
         * @param { String } 基础路径baseUrl
         * @return { Array } [ 模块名, 模块路径 ]
         * =====================================================================
         * 解析规则：
         * baseUrl = http://easyjs.org/js/                                
         * http://example.com/test.js => [ test, http://example.com/test.js ]
         *                  style.css => [ test, http://easyjs.org/js/style.css ]
         *                   ajax/xhr => [ xhr, http://easyjs.org/js/ajax/xhr.js ]
         *                    ../core => [ core, http://easyjs.org/core.js ]
         *                    test.js => [ test, http://easyjs.org/js/test.js ]
         *                       test => [ test, http://easyjs.org/js/test.js ]
         *          test.js?v20121202 => [ test, http://easyjs.org/js/test.js?v20121202 ]
         * =====================================================================
         */
        parseModId : function( id, url ){
            var isAbsoluteId = rProtocol.test( id ),        
                result = id.match( rModId ),
                modName = result[1],
                suffix = result[2] || '.js',
                search = result[3] || '',
                baseUrl, modUrl;  
            
            // 模块标识为绝对路径时，标识就是基础路径
            if( isAbsoluteId ){                
                url = id;
                id = '';
            }

            baseUrl = easyModule.mergePath( id, url );
            modUrl = baseUrl + modName + suffix + search;
            return [ modName, modUrl ];
        },
        
        /*
         * 将依赖模块列表的外部接口(exports)合并成arguments
         * @param { Array }    依赖模块列表
         * @return { Array } 返回参数数组
         */
        getExports : function( deps ){
            if( deps ){
                var len = deps.length,
                    module = seedExports.module,
                    arr = [],
                    i = 0,
                    j = 0,
                    dep;
                    
                for( ; i < len; i++ ){
                    arr[ j++ ] = module[ deps[i] ].exports;
                }
                
                return arr;
            }
            
            return [];
        },    
        
        /*
         * 测试该模块的依赖模块是否都已加载并执行完
         * @param { Object } 模块对象
         * @return { Boolean } 依赖模块是否都加载并执行完
         */    
        isLoaded : function( mod ){
            var deps = mod.deps,
                len = deps.length,
                module = seedExports.module,
                i = 0, depMod;

            for( ; i < len; i++ ){
                depMod = module[ deps[i] ];
                if( depMod.status !== 4 ){
                    return false;
                }
            }
            
            return true;
        },
        
        factoryHandle : function( name, mod, factory, data ){
            // 模块解析完毕，所有的依赖模块也都加载完，但还未输出exports
            mod.status = 3;        

            var args = easyModule.getExports( mod.deps ),   
                exports = typeof factory === 'function' ? factory.apply( null, args ) : factory;
            
            if( exports !== undefined ){
                // 如果有绑定modify方法，将在正式返回exports前进行修改
                if( modifyCache[name] ){
                    exports = modifyCache[ name ]( exports );
                    // 修改后即删除modify方法
                    delete modifyCache[ name ];
                }
                // 存储exports到当前模块的缓存中
                mod.exports = exports;
            }
            
            // 当前模块加载并执行完毕，exports已可用
            mod.status = 4;
            
            if( data ){
                data.length--;
            }        
        },
        
        /*
         * 触发被依赖模块的factory
         * @param { Object } 模块的缓存对象
         */    
        fireFactory : function( useKey ){
            var data = moduleCache[ useKey ],
                factorys = data.factorys,
                result = factorys[0],            
                args, exports, name, toDepMod;   
                
            if( !result ){
                return;
            }
            
            name = result.name;
            toDepMod = seedExports.module[ name ];

            if( easyModule.isLoaded(toDepMod) ){ 
                factorys.shift();
                easyModule.factoryHandle( name, toDepMod, result.factory, data );            
                
                if( factorys.length ){
                    easyModule.fireFactory( useKey );
                }         
            }     
        },
        
        /*
         * 模块加载完触发的回调函数
         * @param{ Object } 模块对象
         */
        complete : function( mod ){
            var module = seedExports.module,
                useKey = mod.useKey,
                keyLen = useKey.length,
                k = 0,
                namesCache, args, cacheLen, cacheMod, name, data, key, i, j;

            for( ; k < useKey.length; k++ ){
                key = useKey[k];
                data = moduleCache[ key ];
                useKey.splice( k--, 1 );

                if( !data ){
                    continue;
                }

                // 队列没加载完将继续加载
                if( data.urls.length ){
                    easyModule.load( key );
                }
                else if( !data.length ){
                    namesCache = data.namesCache;                        
                    cacheLen = namesCache.length;
                    args = [];
                    i = 0;
                    j = 0;
                    
                    // 合并模块的exports为arguments
                    for( ; i < cacheLen; i++ ){  
                        name = namesCache[i];
                        cacheMod = module[ name ];
                        
                        if( cacheMod.status !== 4 ){
                            return;
                        }
                        args[ j++ ] = cacheMod.exports;
                    }
                    
                    // 执行use的回调
                    if( data.callback ){
                        data.callback.apply( null, args );
                    }

                    // 删除队列数据
                    delete moduleCache[ key ];            
                }        
            }
        },
        
        /*
         * 创建script/link元素来动态加载JS/CSS资源
         * @param{ String } 模块的URL
         * @param{ String } 模块名
         * @param{ String } 用来访问存储在moduleCache中的数据的属性名
         * @return { HTMLElement } 用于添加到head中来进行模块加载的元素
         */
        create : function( url, name, useKey ){
            var charset = moduleOptions.charset[ name ],         
                mod = seedExports.module[ name ],
                script, link;
                
            mod.status = 1;
            
            // CSS模块的处理
            if( ~url.indexOf('.css') ){
                link = document.createElement( 'link' );            
                link.rel = 'stylesheet';
                link.href = url;

                if( charset ){
                    link.charset = charset;
                }
                
                link.onload = link.onerror = function(){
                    link = link.onload = link.onerror = null;
                    mod.status = 4;                
                    moduleCache[ useKey ].length--;
                    easyModule.fireFactory( useKey );
                    easyModule.complete( mod );
                };            
                
                return link;
            }
            
            // JS模块的处理
            script = document.createElement( 'script' );
            script.className = modClassName;
            script.async = true;        

            if( charset ){
                script.charset = charset;
            }
            
            if( isScriptOnload ){
                script.onerror = function(){
                    script.onerror = script.onload = null;
                    head.removeChild( script );
                    script = null;
                    
                    easyModule.error( '[' + name + '] module failed to load, the url is ' + url + '.' );
                };
            }

            script[ isScriptOnload ? 'onload' : 'onreadystatechange' ] = function(){
                if( isScriptOnload || rReadyState.test(script.readyState) ){ 
                    script[ isScriptOnload ? 'onload' : 'onreadystatechange' ] = null;
                    head.removeChild( script );
                    script = null;
                    // 加载成功
                    easyModule.complete( mod );
                }
            };
            
            script.src = url;  
            return script;
        },
        
        /*
         * 加载模块
         * @param { String } 用来访问存储在moduleCache中的数据的属性名
         */ 
        load : function( useKey ){            
            var data = moduleCache[ useKey ],
                module = seedExports.module,
                names = data.names.shift(),
                urls = data.urls.shift(),            
                len = urls.length,
                i = 0,
                mod, script;     

            for( ; i < len; i++ ){
                mod = module[ names[i] ];

                if( mod.useKey === undefined ){
                    mod.useKey = [];
                }

                mod.useKey.push( useKey );

                if( module[names[i]].status === undefined ){
                    script = easyModule.create( urls[i], names[i], useKey );
                    head.insertBefore( script, head.firstChild );
                }
                else{
                    data.length--;
                }
            }
        }   
    };        
    
    var seedExports = {
    
        version : '1.1.2',
        
        module : {},
    
        use : function( ids, fn ){
            ids = typeof ids === 'string' ? [ ids ] : ids;
            var alias = moduleOptions.alias,
                module = seedExports.module,
                len = ids.length,
                isLoaded = false,
                namesCache = [],
                modNames = [],
                modUrls = [],
                j = 0,
                mod, modName, result, useKey, args, name, i, id;     
                
            for( i = 0; i < len; i++ ){
                id = ids[i];
                
                // 获取解析后的模块名和url
                result = easyModule.parseModId( alias[id] || id, moduleOptions.baseUrl );
                modName = alias[ id ] ? id : result[0];
                mod = module[ modName ];    

                if( !mod ){
                    mod = module[ modName ] = {};
                    isLoaded = false;
                }
                else if( mod.status === 4 ){
                    isLoaded = true;
                }

                // 将模块名和模块路径添加到队列中
                modNames[ modNames.length++ ] = modName;
                modUrls[ modUrls.length++ ] = mod.url = result[1];
            }
            
            // 生成队列的随机属性名
            useKey = modNames.join( '_' ) + '_' + ( +new Date() ) + ( Math.random() + '' ).slice( -8 );
            // 复制模块名，在输出exports时会用到
            namesCache = namesCache.concat( modNames );
            
            // 在模块都合并的情况下直接执行callback
            if( isLoaded ){
                len = namesCache.length;
                args = [];
                
                // 合并模块的exports为arguments
                for( i = 0; i < len; i++ ){
                    name = namesCache[i];
                    mod = module[ name ];
                    
                    if( mod.status !== 4 ){
                        easyModule.error( '[' + name + '] module failed to use.' );
                    }
                    
                    args[ j++ ] = mod.exports;
                }
                
                // 执行use的回调
                if( fn ){
                    fn.apply( null, args );
                }
                
                return;
            }
            
            // 添加队列
            moduleCache[ useKey ] = {
                length : namesCache.length,
                namesCache : namesCache,
                names : [ modNames ],
                urls : [ modUrls ],
                callback : fn,
                factorys : [],            
                deps : {}
            };

            // 开始加载
            easyModule.load( useKey );
        },
        
        /*
         * 给模块添加modify方法以便在正式返回exports前进行修改
         * @param { String } 模块名
         * @param { Function } 修改exports的函数，该函数至少要有一个返回值
         */
        modify : function( name, fn ){        
            modifyCache[ name ] = fn;
        },
        
        /*
         * 修改模块加载器的配置
         * @param { Object }
         */
        config : function( options ){
            var baseUrl, isHttp;
        
            if( options.baseUrl ){
                baseUrl = options.baseUrl;
                isHttp = baseUrl.slice( 0, 4 ) === 'http';
                
                if( isHttp ){
                    moduleOptions.baseUrl = baseUrl;
                }
                // 相对路径的baseUlr是基于HTML页面所在的路径(无论是http地址还是file地址)
                else{
                    moduleOptions.baseUrl = easyModule.mergePath( baseUrl, window.location.href );
                }
            }
            
            easyModule.merge( 'charset', options.charset );
            easyModule.merge( 'alias', options.alias );
        }
    
    };   
    
     /*
      * 定义模块的全局方法(AMD规范)
      * @param { String } 模块名
      * @param { Array } 依赖模块列表，单个可以用字符串形式传参，多个用数组形式传参
      * @param { Function } 模块的内容
      * factory的参数对应依赖模块的外部接口(exports)
      */
    window.define = function( name, deps, factory ){              
        if( typeof name !== 'string' ){
            if( typeof name === 'function' ){
                factory = name;
            }  
            else{
                factory = deps;
                deps = name;
            }
            name = easyModule.getCurrentScript();
        }
        else if( deps !== undefined && factory === undefined ){
            factory = deps;
            deps = null;
        }

        var alias = moduleOptions.alias,
            module = seedExports.module,
            mod = module[ name ],
            isRepeat = false,
            isLoaded = true,
            names = [],
            urls = [],
            insertIndex = 0,
            pullIndex = 0,
            useKey, data, modUrl, factorys, baseUrl, depMod, depName, result, exports, args, depsData, repeatDepsData, i, repeatName, dep;
            
        // 在模块都合并的情况下直接执行factory
        if( !mod ){
            mod = module[ name ] = {};
            
            if( deps ){
                mod.deps = deps;
            }
            
            easyModule.factoryHandle( name, mod, factory );
            return;
        }
        
        useKey = mod.useKey[0];
        data = moduleCache[ useKey ];
        modUrl = mod.url;

        // 开始解析模块内容
        mod.status = 2;
        mod.deps = [];

        // 如果有依赖模块，先加载依赖模块
        if( deps && deps.length ){     
            // 依赖模块的baseUrl是当前模块的baseUrl
            baseUrl = modUrl.slice( 0, modUrl.lastIndexOf('/') + 1 );        
            factorys = data.factorys;
            depsData = data.deps[ name ] = {};

            // 遍历依赖模块列表，如果该依赖模块没加载过，
            // 则将该依赖模块名和模块路径添加到当前模块加载队列的数据去进行加载
            for( i = 0; i < deps.length; i++ ){              
                dep = deps[i];             
                result = easyModule.parseModId( alias[dep] || dep, baseUrl );
                depName = alias[ dep ] ? dep : result[0];             
                depMod = module[ depName ];
                mod.deps.push( depName );            
                depsData[ depName ] = true;

                if( depMod ){
                    if( depMod.status !== 4 ){                
                        // 获取第一个重复依赖的模块名，会在稍后进行factorys的顺序调整
                        if( !isRepeat ){
                            isRepeat = true;
                            repeatName = depName;
                        }
                        isLoaded = false;    
                    }              
                    deps.splice( i--, 1 );
                    continue;
                }
                else{
                    depMod = module[ depName ] = {};
                }   
        
                isLoaded = false;
                data.length++;
                names[ names.length++ ] = depName;
                urls[ urls.length++ ] = depMod.url = result[1];
            }
            
            // 只要当前模块有一个依赖模块没加载完就将当前模块的factory添加到factorys中
            if( !isLoaded ){
                factorys.unshift({
                    name : name, 
                    factory : factory        
                });                    
            
                // 有重复依赖时将调整factorys的顺序
                if( repeatName ){
                    repeatDepsData = data.deps[ repeatName ];
                    for( i = factorys.length - 1; i >= 0; i-- ){
                        result = factorys[i].name;
                        if( result === repeatName ){
                            pullIndex = i;                         
                            if( !repeatDepsData ){
                                break;
                            }
                        }
                        
                        if( repeatDepsData && repeatDepsData[result] ){
                            insertIndex = i;
                            break;
                        }
                    }

                    // 将重复模块的factory插入到该模块最后一个依赖模块的factory后
                    factorys.splice( insertIndex + 1, 0, factorys.splice(pullIndex, 1)[0] );
                    // 将当前模块的factory插入到重复模块的factory后
                    factorys.splice( insertIndex + 1, 0, factorys.shift() );
                }
            }
       
            if( names.length ){
                data.names.unshift( names );
                data.urls.unshift( urls );
            }
        }
        
        // 该模块无依赖模块就直接执行其factory
        if( isLoaded ){        
            easyModule.factoryHandle( name, mod, factory, data );
        }

        easyModule.fireFactory( useKey );
        
        // 无依赖列表将删除依赖列表的数组 
        if( !mod.deps.length ){
            delete mod.deps;
        }
    };
    
    window.define.amd = {
        jQuery : true
    };

    // 初始化模块加载器
    easyModule.init();
    
    return seedExports;
};

window.seed = seed();

})( window );