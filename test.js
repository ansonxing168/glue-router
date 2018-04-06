const
    get = require('lodash/get'),
    set = require('lodash/set'),
    isArray = require('lodash/isArray'),
    flatMap = require('lodash/flatMap')


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
        return items
    }, data)
}

const setVal = (data, path, tgtPath, resps) => {
    function dissect(obj, fields) {
        if (isArray(obj)) {
            obj.map(item => {
                dissect(item, fields)
            })
        } else {
            if (fields.length === 1) {
                const field = fields[0]
                const id = obj[field]
                const tgt = resps.filter(item => item.id == id)[0]
                set(obj, tgtPath, tgt)
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
const data1 = {
    content: [{
        data: {
            id: 1
        }
    }, {
        data: {
            id: 2
        }
    }, {
        data: {
            id: 3
        }
    }]
}

const data2 = {
    content: [{
        data: [{
            id: 1
        }, {
            id: 2
        }, {
            id: 3
        }]
    }, {
        data: [{
            id: 4
        }, {
            id: 5
        }, {
            id: 6
        }]
    }, {
        data: [{
            id: 7
        }, {
            id: 8
        }, {
            id: 9
        }]
    }]
}

const data3 = [{
    content: {
        data: [{
            id: 1
        }]
    }
}, {
    content: {
        data: [{
            id: 2
        }]
    }
}, {
    content: {
        data: [{
            id: 3
        }]
    }
}]
// const ids = getIds(data1, 'content.data.id')

const response = [{
    id: 1,
    text: 'test1'
}, {
    id: 2,
    text: 'test2'
}, {
    id: 3,
    text: 'test3'
}, {
    id: 4,
    text: 'test4'
}]
const res = setVal(data3, 'content.data.id', 'vo', response)
console.log(JSON.stringify(res));