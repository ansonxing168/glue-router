const Koa = require('koa'),
    rp = require('request-promise'),
    koaBody = require('koa-body'),
    logger = require('koa-logger'),
    parse = require('url-parse'),
    omit = require('lodash/omit'),
    get = require('lodash/get'),
    set = require('lodash/set'),
    uniq = require('lodash/uniq'),
    flatMap = require('lodash/flatMap'),
    zip = require('lodash/zip'),
    isArray = require('lodash/isArray'),
    fs = require('fs'),
    program = require('commander')
let setting = {}

const app = new Koa();
app.use(logger());
app.use(koaBody({
    multipart: true
}));

searchRoute = (url) => {
    const parsed = parse(url)
    return setting.routes.filter(item => parsed.pathname.indexOf(item.frontend) > -1)[0]
}

searchBackend = (route) => {
    const backendRef = !!route ? route.backendRef : 'default'
    return setting.backends.filter(item => item.name === backendRef)[0]
}

searchBackendUrl = (backend, route, url) => {
    if (!!route) {
        if (route.removePrefix) {
            if (typeof (route.removePrefix) === 'string') {
                return !!url ? backend.url + url.substr(url.lastIndexOf(route.removePrefix) + route.removePrefix.length) : backend.url
            } else {
                return !!url ? backend.url + url.substr(url.lastIndexOf(route.frontend) + route.frontend.length) : backend.url
            }
        } else {
            return !!url ? backend.url + url : backend.url
        }
    } else {
        return backend.url + url
    }
}

buildHeaders = (route, headers) => {
    const backendRef = !!route ? route.backendRef : 'default'
    const backend = setting.backends.filter(item => item.name === backendRef)[0]
    return omit(headers, backend.passthroughHeaders ? backend.passthroughHeaders.excludes : [])
}

const getIds = (data, path) => {
    return path.split('.').reduce((result, field) => {
        let items = []
        function flatValue(item) {
            return [].concat(item[field] || [])
        }
        if (isArray(result)) {
            items = flatMap(result, flatValue)
        } else {
            items = items.concat(result[field] || [])
        }
        return items.filter(item => !!item)
    }, data)
}

const setVal = (data, path, tgtPath, resps) => {
    function dissect(obj, fields) {
        if (!obj) return
        if (isArray(obj)) {
            obj.map(item => {
                dissect(item, fields)
            })
        } else {
            if (fields.length === 1) {
                const field = fields[0]
                const id = obj[field]
                if (isArray(resps)) {
                    const tgt = resps.filter(item => item.id == id)[0]
                    set(obj, tgtPath, tgt)
                } else {
                    set(obj, tgtPath, resps)
                }
            } else if (fields.length > 1) {
                const field = fields[0]
                dissect(obj[field], fields.slice(1))
            }
        }
    }
    const fields = path.split('.')
    dissect(data, fields)
    return data
}

let respHeader
const request = (method, url, headers, body, includeStatus) => {
    let opts = {
        method,
        url,
        headers: headers,
        json: true,
        transform: (body, response) => {
            respHeader = response.headers
            if (includeStatus) {
                return {
                    status: response.statusCode,
                    body
                }
            } else {
                return body
            }
        }
    }
    if (!!headers['content-type'] && headers['content-type'].indexOf('multipart/form-data') > -1) {
        opts = Object.assign({}, opts, {
            formData: {
                data: {
                    value: fs.createReadStream(body.files.data.path),
                    options: {
                        filename: body.files.data.name,
                        contentType: body.files.data.type
                    }
                }
            }
        })
    } else {
        opts = Object.assign({}, opts, {
            body
        })
    }
    return rp(opts).catch(function (error) {
        if (!includeStatus) {
            return {
                error: error.error
            }
        }
        throw error
    });
}

// response
app.use(async ctx => {
    try {
        const req = ctx.request
        const route = searchRoute(req.url)
        const headers = buildHeaders(route, ctx.header)
        const body = ctx.request.body
        const backend = searchBackend(route)
        const backendUrl = searchBackendUrl(backend, route, req.url)
        if ((route || {}).contentType === 'application/octet-stream') {
            ctx.body = rp(backendUrl, {
                headers
            })
            return
        }

        const resp = await request(req.method, backendUrl, headers, body, true)
        ctx.status = resp.status
        let data = resp.body

        if (!!(route || {}).rules && !!data) {
            async function requestData(rule) {
                let ids = uniq(getIds(data, rule.src))
                if (ids.length === 0) return []
                const subBackend = searchBackend(rule)
                if (subBackend.method === 'POST') {
                    const subUrl = searchBackendUrl(subBackend, rule)
                    const subHeaders = buildHeaders(rule, ctx.header)
                    return request(subBackend.method, subUrl, subHeaders, ids)
                } else {
                    const subUrl = searchBackendUrl(subBackend, rule) + '/' + ids.join(',')
                    const subHeaders = buildHeaders(rule, ctx.header)
                    return request('GET', subUrl, subHeaders, {})
                }
            }
            const promises = route.rules.map(requestData)
            let resps = await Promise.all(promises)
            if (resps.length !== 0) {
                const zipRRs = zip(route.rules, resps)
                // zip result: [[rule, resp], [rule, resp]]
                zipRRs.forEach(item => {
                    const rule = item[0]
                    const resp = item[1]
                    setVal(data, rule.src, rule.tgt, resp)
                })
            }
            ctx.body = data
        } else {
            ctx.body = data
        }
        ctx.set(omit(respHeader, ['Content-Length', 'transfer-encoding', 'server', 'x-application-context']));
    } catch (error) {
        console.log(error);
        ctx.status = error.statusCode || 400
        ctx.body = error.response ? error.response.body : error
    }
});

let port = 3000
program
    .version('0.1.0')
    .option('-i, --input [value]', 'set config file', function (arg) {
        const data = fs.readFileSync(arg, 'utf8');
        console.log(`Set config file: ${arg}`);
        setting = JSON.parse(data)
    })
    .option('-p, --port [value]', 'set port', function (arg) {
        port = arg
        console.log(`Set server port: ${arg}`);
    })
    .parse(process.argv);
app.listen(port, function () {
    console.log('Server start...');
});