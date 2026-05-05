require('dotenv').config()
const express = require('express')
const app = express()

app.use(express.json())

const outletsRouter = require('./routes/outlets')
app.use('/api/v1/outlets', outletsRouter)

const adminRouter = require('./routes/admin')
app.use('/api/v1/admin', adminRouter)

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 ZeroThree Backend is live on port ${PORT}`)
})