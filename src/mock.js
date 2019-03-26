const jsonServer = require('json-server')
const server = jsonServer.create()
const middlewares = jsonServer.defaults()

// Set default middlewares (logger, static, cors and no-cache)
server.use(middlewares)

// To handle POST, PUT and PATCH you need to use a body-parser
// You can use the one used by JSON Server
server.use(jsonServer.bodyParser)

server.get('/test', (req, res) => {
    res.status(204).json()
})


// Use default router
server.listen(3010, () => {
    console.log('Mock Server is running')
})