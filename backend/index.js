require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

//Webadmin
app.use(cors())
app.use(express.json())

const outletsRouter = require('./routes/outlets')
app.use('/api/v1/outlets', outletsRouter)

const adminRouter = require('./routes/admin')
app.use('/api/v1/admin', adminRouter)

const visitsRouter = require('./routes/visits')
app.use('/api/v1/visits', visitsRouter)

const authRouter = require('./routes/auth');
app.use('/api/v1/auth', authRouter);

const photosRouter = require('./routes/photos');
app.use('/api/v1', photosRouter);

const routesRouter = require('./routes/routes');
app.use('/api/v1', routesRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 ZeroThree Backend is live on port ${PORT}`)
})